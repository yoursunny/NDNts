import { canSatisfy, Data, Interest } from "@ndn/l3pkt";
import hirestime from "hirestime";
import { consume, filter, flatMap, map, pipeline, tap } from "streaming-iterables";

import { FaceImpl } from "./face";
import { DataResponse, InterestToken } from "./reqres";

const getNow = hirestime() as () => number;

interface PitDn {
  nRx: number;
  expire: number;
  nonce: number;
  token: any;
}

export class PitEntry {
  public readonly interest: Interest;
  public dnRecords = new Map<FaceImpl, PitDn>();
  public lastExpire: number = 0;
  public expireTimer?: NodeJS.Timer|number;

  constructor(private readonly pit: Pit, public readonly key, interest: Interest) {
    this.interest = new Interest(interest);
  }

  public receiveInterest(face: FaceImpl, interest: Interest, token: any) {
    const now = getNow();
    const expire = now + interest.lifetime;
    const nonce = typeof interest.nonce === "undefined" ?
                  Interest.generateNonce() : interest.nonce;

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

  public cancelInterest(face: FaceImpl) {
    const dnR = this.dnRecords.get(face);
    if (!dnR) {
      return;
    }
    this.dnRecords.delete(face);
    this.updateExpire();
    face.send({ reject: "cancel", [InterestToken]: dnR.token });
  }

  public forwardInterest(face: FaceImpl) {
    const now = getNow();
    this.interest.lifetime = this.lastExpire - now;
    face.send(this.interest);
  }

  public returnData(face: FaceImpl, data: Data): AsyncIterable<{ dn: FaceImpl, token: any }> {
    clearTimeout(this.expireTimer as number);
    this.pit.table.delete(this.key);
    const now = getNow();
    return pipeline(
      () => this.dnRecords.entries(),
      filter<[FaceImpl, PitDn]>(([dn, { expire }]) => expire > now && dn !== face),
      map(([dn, { token }]) => ({dn, token})),
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
      face.send({ reject: "expire", [InterestToken]: dnR.token });
    }
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
    const responses = new Map<FaceImpl, DataResponse>();
    await pipeline(
      () => this.table.values(),
      filter<PitEntry>((entry) => canSatisfy(entry.interest, data)),
      flatMap((entry) => entry.returnData(face, data)),
      tap(({ dn, token }) => {
        let resp = responses.get(dn);
        if (!resp) {
          resp = Object.assign(new Data(data), { [InterestToken]: [] });
          responses.set(dn, resp);
        }
        resp[InterestToken].push(token);
      }),
      consume,
    );
    for (const [dn, resp] of responses) {
      dn.send(resp);
    }
    return responses.size > 0;
  }
}
