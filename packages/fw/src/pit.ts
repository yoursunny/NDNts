import { canSatisfy, Data, Interest } from "@ndn/l3pkt";
import { toHex } from "@ndn/tlv";
import hirestime from "hirestime";
import { consume, filter, flatMap, map, pipeline, tap } from "streaming-iterables";

import { FaceImpl } from "./face";
import { DataResponse, InterestToken, RejectInterest } from "./reqres";

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
  token: any;
}

/** Aggregated pending Interests from one or more downstream faces. */
export class PitEntry {
  /** Representative Interest. */
  public readonly interest: Interest;
  /** Downstream records. */
  public dnRecords = new Map<FaceImpl, PitDn>();
  /** Last expiration time among downstreams. */
  public lastExpire: number = 0;
  /** Entry expiration timer; should match this.lastExpire. */
  public expireTimer?: NodeJS.Timer|number;

  constructor(private readonly pit: Pit, public readonly key: string, interest: Interest) {
    this.interest = new Interest(interest);
  }

  /** Record Interest from downstream. */
  public receiveInterest(face: FaceImpl, interest: Interest, token: any) {
    const now = getNow();
    const expire = now + interest.lifetime;
    const nonce = interest.nonce ?? Interest.generateNonce();

    const dnR = this.dnRecords.get(face);
    if (dnR) {
      ++dnR.nRx;
      dnR.expire = expire;
      dnR.nonce = nonce;
      dnR.token = token;
    } else {
      this.dnRecords.set(face, { nRx: 1, expire, nonce, token });
    }

    this.updateExpire(now);
  }

  /** Record Interest cancellation from downstream. */
  public cancelInterest(face: FaceImpl) {
    const dnR = this.dnRecords.get(face);
    if (!dnR) {
      return;
    }
    this.dnRecords.delete(face);
    this.updateExpire();
    face.send(new RejectInterest("cancel", this.interest, dnR.token));
  }

  /** Forward Interest to upstream. */
  public forwardInterest(face: FaceImpl) {
    const now = getNow();
    this.interest.lifetime = this.lastExpire - now;
    face.send(this.interest);
  }

  /** Determine which downstream faces should receive Data from upstream. */
  public returnData(face: FaceImpl, data: Data): AsyncIterable<{ dn: FaceImpl, token: any }> {
    clearTimeout(this.expireTimer as number);
    this.pit.table.delete(this.key);
    const now = getNow();
    return pipeline(
      () => this.dnRecords.entries(),
      filter<[FaceImpl, PitDn]>(([dn, { expire }]) => expire > now && dn !== face),
      map(([dn, { token }]) => ({ dn, token })),
    );
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
      this.pit.table.set(this.key, this);
      this.expireTimer = setTimeout(this.expire, this.lastExpire - now);
    }
  }

  private expire = () => {
    this.pit.table.delete(this.key);
    for (const [face, dnR] of this.dnRecords) {
      face.send(new RejectInterest("expire", this.interest, dnR.token));
    }
  }
}

/** Pending Interest table. */
export class Pit {
  public readonly table = new Map<string, PitEntry>();

  /** Find or insert entry. */
  public lookup(interest: Interest): PitEntry;

  /** Find entry, disallow insertion. */
  public lookup(interest: Interest, canInsert: false): PitEntry|undefined;

  public lookup(interest: Interest, canInsert: boolean = true) {
    const key = `${toHex(interest.name.value)} ${interest.canBePrefix ? "+" : "-"}${interest.mustBeFresh ? "+" : "-"}`;
    let entry = this.table.get(key);
    if (!entry && canInsert) {
      entry = new PitEntry(this, key, interest);
    }
    return entry;
  }

  /**
   * Satisfy pending Interests with incoming Data.
   * @returns true if Data satisfies any pending Interest, or false if Data is unsolicited.
   */
  public async satisfy(face: FaceImpl, data: Data): Promise<boolean> {
    const responses = new Map<FaceImpl, DataResponse>();
    await pipeline(
      () => this.table.values(),
      filter<PitEntry>((entry) => canSatisfy(entry.interest, data)),
      flatMap((entry) => entry.returnData(face, data)),
      tap(({ dn, token }) => {
        let resp = responses.get(dn);
        if (!resp) {
          resp = InterestToken.set(new Data(data), []);
          responses.set(dn, resp);
        }
        InterestToken.get(resp).push(token);
      }),
      consume,
    );
    for (const [dn, resp] of responses) {
      dn.send(resp);
    }
    return responses.size > 0;
  }
}
