import { Data, Interest } from "@ndn/packet";
import { toHex } from "@ndn/tlv";
import hirestime from "hirestime";
import DefaultMap from "mnemonist/default-map.js";
import { filter, flatMap, pipeline, reduce, tap } from "streaming-iterables";

import type { FaceImpl } from "./face";
import { FwPacket, RejectInterest } from "./packet";

const getNow = hirestime();

/** Downstream of pending Interest. */
interface PitDn {
  /** How many times this downstream has (re)transmitted the Interest. */
  nRx: number;
  /** Expiration time of this pending Interest at downstream. */
  expire: number;
  /** Last nonce from this downstream. */
  nonce: number;
  /** Last InterestToken from this downstream. */
  token: unknown;
}

/** Aggregated pending Interests from one or more downstream faces. */
export class PitEntry {
  /** Representative Interest. */
  public readonly interest: Interest;
  /** Outgoing numeric PIT token. */
  public token?: number;
  /** Downstream records. */
  public dnRecords = new DefaultMap<FaceImpl, PitDn>(
    () => ({ nRx: 0, expire: 0, nonce: 0, token: undefined }));

  /** Last expiration time among downstream. */
  public lastExpire = 0;
  /** Entry expiration timer; should match this.lastExpire. */
  public expireTimer?: NodeJS.Timer | number;

  constructor(private readonly pit: Pit, public readonly key: string, interest: Interest) {
    this.interest = new Interest(interest);
  }

  /** Record Interest from downstream. */
  public receiveInterest(face: FaceImpl, { l3: interest, token }: FwPacket<Interest>) {
    const now = getNow();
    const expire = now + interest.lifetime;
    const nonce = interest.nonce ?? Interest.generateNonce();

    const dnR = this.dnRecords.get(face);
    ++dnR.nRx;
    dnR.expire = expire;
    dnR.nonce = nonce;
    dnR.token = token;

    this.updateExpire(now);
  }

  /** Record Interest cancellation from downstream. */
  public cancelInterest(face: FaceImpl) {
    const dnR = this.dnRecords.peek(face);
    if (!dnR) { return; }

    this.dnRecords.delete(face);
    this.updateExpire();
    face.send(new RejectInterest("cancel", this.interest, dnR.token));
  }

  /** Forward Interest to upstream. */
  public forwardInterest(face: FaceImpl) {
    const lifetime = this.lastExpire - getNow();
    if (lifetime <= 0) {
      return;
    }
    this.interest.lifetime = lifetime;
    face.send(FwPacket.create(this.interest, this.token));
  }

  /** Determine which downstream faces should receive Data from upstream. */
  public *returnData(up: FaceImpl): Iterable<{ dn: FaceImpl; token: unknown }> {
    clearTimeout(this.expireTimer as number);
    this.pit.eraseEntry(this);
    const now = getNow();
    for (const [dn, { expire, token }] of this.dnRecords) {
      if (expire > now && dn !== up) {
        yield { dn, token };
      }
    }
  }

  private updateExpire(now: number = getNow()) {
    let lastExpire = 0;
    for (const { expire } of this.dnRecords.values()) {
      lastExpire = Math.max(lastExpire, expire);
    }
    if (lastExpire <= now) {
      lastExpire = 0;
    }

    if (this.lastExpire === lastExpire) {
      return;
    }
    this.lastExpire = lastExpire;

    clearTimeout(this.expireTimer as number);
    if (this.lastExpire === 0) {
      this.expire();
    } else {
      this.pit.insertEntry(this);
      this.expireTimer = setTimeout(this.expire, this.lastExpire - now);
    }
  }

  private expire = () => {
    this.pit.eraseEntry(this);
    for (const [face, dnR] of this.dnRecords) {
      face.send(new RejectInterest("expire", this.interest, dnR.token));
    }
  };
}

/** Pending Interest table. */
export class Pit {
  public readonly byName = new Map<string, PitEntry>();
  public readonly byToken = new Map<number, PitEntry>();
  private lastToken = 0;

  /**
   * true: try to match Data without token.
   * false: Data without token.
   * callback function: invoked when Data without token matches PIT entry.
   *   return true: deliver matched PIT entry.
   *   return false: drop Data.
   */
  public dataNoTokenMatch: boolean | ((data: Data, key: string) => boolean) = true;

  private generateToken(): number {
    do {
      --this.lastToken;
      if (this.lastToken <= 0) {
        this.lastToken = 0xFFFFFFFF;
      }
    } while (this.byToken.has(this.lastToken));
    return this.lastToken;
  }

  public insertEntry(entry: PitEntry) {
    this.byName.set(entry.key, entry);
    entry.token ??= this.generateToken();
    this.byToken.set(entry.token, entry);
  }

  public eraseEntry(entry: PitEntry) {
    this.byName.delete(entry.key);
    this.byToken.delete(entry.token!);
  }

  /** Find or insert entry. */
  public lookup(interest: FwPacket<Interest>): PitEntry;

  /** Find entry, disallow insertion. */
  public lookup(interest: FwPacket<Interest>, canInsert: false): PitEntry | undefined;

  public lookup({ l3: interest }: FwPacket<Interest>, canInsert = true) {
    const key = `${toHex(interest.name.value)} ${interest.canBePrefix ? "+" : "-"}${interest.mustBeFresh ? "+" : "-"}`;
    let entry = this.byName.get(key);
    if (!entry && canInsert) {
      entry = new PitEntry(this, key, interest);
    }
    return entry;
  }

  /**
   * Satisfy pending Interests with incoming Data.
   * @returns true if Data satisfies any pending Interest, or false if Data is unsolicited.
   */
  public async satisfy(face: FaceImpl, { l3: data, token }: FwPacket<Data>): Promise<boolean> {
    const nSentData = await pipeline(
      () => this.findPotentialMatches(data, token),
      filter(({ interest }: PitEntry) => data.canSatisfy(interest)),
      flatMap((entry) => entry.returnData(face)),
      tap(({ dn, token: dnToken }) => dn.send(FwPacket.create(data, dnToken))),
      reduce((count) => count + 1, 0),
    );
    return nSentData > 0;
  }

  private *findPotentialMatches(data: Data, token: unknown): Iterable<PitEntry> {
    if (typeof token === "number") {
      const entry = this.byToken.get(token);
      if (entry) {
        yield entry;
      }
      return;
    }

    if (this.dataNoTokenMatch === false) {
      return;
    }

    for (let [prefix, exact] = [data.name, true];
      prefix.length > 0;
      [prefix, exact] = [prefix.getPrefix(-1), false]) {
      const prefixHex = toHex(prefix.value);
      for (const keySuffix of (exact ? [" ++", " +-", " -+", " --"] : [" ++", " +-"])) {
        const key = prefixHex + keySuffix;
        const entry = this.byName.get(key);
        if (entry) {
          if (typeof this.dataNoTokenMatch === "function" &&
              !this.dataNoTokenMatch(data, key)) {
            return;
          }
          yield entry;
        }
      }
    }
  }
}
