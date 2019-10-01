import { Data, Interest } from "@ndn/l3pkt";
import { EventEmitter } from "events";
import { StrictEventEmitter } from "strict-event-emitter-types";

import { PitImpl } from "./internal";

interface Events {
  /** Emitted when Interest has been satisfied. */
  data: Data;
  /** Emitted when Interest times out. */
  timeout: void;
  /** Emitted when PendingInterest is canceled. */
  cancel: void;
}

type Emitter = StrictEventEmitter<EventEmitter, Events>;

const TIMEOUT = "4a96aedc-be5d-4eab-8a2b-775f13a7a982";

export class PendingInterest extends (EventEmitter as new() => Emitter) {
  public get promise(): Promise<Data> {
    if (!this.promise_) {
      this.promise_ = new Promise<Data>((resolve, reject) => {
        this.on("data", resolve);
        this.on("timeout", () => reject(new Error("Interest timeout")));
        this.on("cancel", () => reject(new Error("PendingInterest canceled")));
      });
    }
    return this.promise_;
  }

  private timers: Record<string, number> = {};
  private promise_?: Promise<Data>;

  constructor(private readonly table: PitImpl.Table, public readonly interest: Interest) {
    super();
    this.setTimer(TIMEOUT, interest.lifetime, () => {
      this.clearTimers();
      this.emit("timeout");
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

  public [PitImpl.SATISFY](data: Data) {
    this.clearTimers();
    this.emit("data", data);
  }

  /** Indicate the requester no longer wants the Data. */
  public cancel() {
    this.clearTimers();
    this.emit("cancel");
    this.table[PitImpl.REMOVE](this);
  }

  private clearTimers() {
    Object.values(this.timers).forEach(clearTimeout);
    this.timers = {};
  }
}
