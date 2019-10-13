import { canSatisfy, Data, Interest } from "@ndn/l3pkt";
import hirestime from "hirestime";
import { filter, pipeline, reduce, tap } from "streaming-iterables";

import { FaceImpl } from "./face";

const getNow = hirestime() as () => number;

interface PitIn {
  nRx: number;
  expire: number;
  nonce: number;
}

export class PitEntry {
  public readonly interest: Interest;
  public inRecords = new Map<FaceImpl, PitIn>();
  public lastExpire: number = 0;
  public expireTimer?: NodeJS.Timer|number;

  constructor(private readonly pit: Pit, public readonly key, interest: Interest) {
    this.interest = new Interest(interest);
  }

  public receiveInterest(face: FaceImpl, interest: Interest) {
    const now = getNow();
    const expire = now + interest.lifetime;
    const nonce = typeof interest.nonce === "undefined" ?
                  Interest.generateNonce() : interest.nonce;

    const inR = this.inRecords.get(face);
    if (inR) {
      ++inR.nRx;
      inR.expire = expire;
    } else {
      this.inRecords.set(face, { nRx: 1, expire, nonce });
    }

    this.updateExpire(now);
  }

  public cancelInterest(face: FaceImpl) {
    const now = getNow();
    this.inRecords.delete(face);
    this.updateExpire(now);
  }

  public forwardInterest(face: FaceImpl) {
    const now = getNow();
    this.interest.lifetime = this.lastExpire - now;
    face.send(this.interest);
  }

  public returnData(face: FaceImpl, data: Data) {
    const now = getNow();
    for (const [dn, { expire }] of this.inRecords) {
      if (expire > now && dn !== face) {
        dn.send(data);
      }
    }
    clearTimeout(this.expireTimer as number);
    this.pit.table.delete(this.key);
  }

  private updateExpire(now: number) {
    let lastExpire = 0;
    for (const { expire } of this.inRecords.values()) {
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
  }
}

export class Pit {
  public readonly table = new Map<string, PitEntry>();

  public lookup(interest: Interest): PitEntry;
  public lookup(interest: Interest, canInsert: false): PitEntry|undefined;
  public lookup(interest: Interest, canInsert: boolean = true) {
    const key = `${interest.name} ${interest.canBePrefix ? "+" : "-"}${interest.mustBeFresh ? "+" : "-"}`;
    let entry = this.table.get(key);
    if (!entry && canInsert) {
      entry = new PitEntry(this, key, interest);
    }
    return entry;
  }

  public async satisfy(face: FaceImpl, data: Data): Promise<boolean> {
    const nSatisfied = await pipeline(
      () => this.table.values(),
      filter<PitEntry>((entry) => canSatisfy(entry.interest, data)),
      tap<PitEntry>((entry) => entry.returnData(face, data)),
      reduce((count) => count + 1, 0),
    );
    return nSatisfied > 0;
  }
}
