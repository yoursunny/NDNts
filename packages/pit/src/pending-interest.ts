import { Data, Interest } from "@ndn/l3pkt";
import { EventEmitter } from "events";
import { StrictEventEmitter } from "strict-event-emitter-types";

import { PitImpl } from "./internal";

const TIMEOUT = "4a96aedc-be5d-4eab-8a2b-775f13a7a982";

type Emitter = StrictEventEmitter<EventEmitter, PendingInterest.Events>;

export class PendingInterest extends (EventEmitter as new() => Emitter) {
  public get promise(): Promise<Data> {
    if (!this.promise_) {
      this.promise_ = new Promise<Data>((resolve, reject) => {
        this.on("data", resolve);
        this.on("expire", () => reject(new Error("Interest timeout")));
        this.on("cancel", () => reject(new Error("PendingInterest canceled")));
      });
    }
    return this.promise_;
  }

  public get interest() { return this.interest_; }
  public get remainingLifetime(): number { return this.expireTime - Date.now(); }

  private interest_: Interest;
  private expireTime: number;
  private timers: Record<string, number> = {};
  private promise_?: Promise<Data>;

  constructor(private readonly table: PitImpl.Table, interest: Interest) {
    super();
    this.interest_ = new Interest(interest);
    if (typeof this.interest_.nonce === "undefined") {
      this.interest_.nonce = Interest.generateNonce();
    }
    this.expireTime = Date.now() + this.interest_.lifetime;
    this.setTimer(TIMEOUT, this.interest_.lifetime, () => {
      this.clearTimers();
      this.emit("expire");
      this.table[PitImpl.REMOVE](this);
    });
  }

  /**
   * Schedule a timer associated with this pending Interest.
   * This cancels previous timer with same id.
   * All timers will be canceled when the pending Interest is satisfied/expired/canceled.
   */
  public setTimer(id: string, timeout: number, f: () => any) {
    this.clearTimer(id);
    this.timers[id] = setTimeout(f, timeout) as any;
  }

  /** Cancel a timer. */
  public clearTimer(id: string) {
    clearTimeout(this.timers[id]);
    delete this.timers[id];
  }

  /**
   * Change InterestLifetime so that it reflects the remaining lifetime of this entry.
   * @returns true if successful, false if entry is satisfied/expired/canceled.
   */
  public adjustInterestLifetime(): boolean {
    const lifetime = this.remainingLifetime;
    if (lifetime <= 0) {
      return false;
    }
    this.interest_.lifetime = lifetime;
    return true;
  }

  public [PitImpl.SATISFY](data: Data) {
    this.expireTime = 0;
    this.clearTimers();
    this.emit("data", data);
  }

  /** Indicate the requester no longer wants the Data. */
  public cancel() {
    this.expireTime = 0;
    this.clearTimers();
    this.emit("cancel");
    this.table[PitImpl.REMOVE](this);
  }

  private clearTimers() {
    Object.values(this.timers).forEach(clearTimeout);
    this.timers = {};
  }
}

export namespace PendingInterest {
  export interface Events {
    /** Emitted when Interest has been satisfied. */
    data: Data;
    /** Emitted when Interest expires. */
    expire: void;
    /** Emitted when PendingInterest is canceled. */
    cancel: void;
  }
}
