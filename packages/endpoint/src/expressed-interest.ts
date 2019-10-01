import { Data } from "@ndn/l3pkt";
import { PendingInterest } from "@ndn/pit";
import { EventEmitter } from "events";
import { StrictEventEmitter } from "strict-event-emitter-types";

interface Events {
  /** Emitted when Interest has been satisfied. */
  data: Data;
  /** Emitted when ExpressedInterest expires. */
  expire: void;
  /** Emitted when ExpressedInterest is canceled. */
  cancel: void;
}

type Emitter = StrictEventEmitter<EventEmitter, Events>;

export class ExpressedInterest extends (EventEmitter as new() => Emitter) {
  public get interest() { return this.pi.interest; }
  public get promise() { return this.pi.promise; }

  constructor(private readonly pi: PendingInterest) {
    super();
    pi.on("data", (data) => this.emit("data", data));
    pi.on("timeout", () => this.emit("expire"));
    pi.on("cancel", () => this.emit("cancel"));
  }

  /**
   * Schedule a timer associated with this expressed Interest.
   * This cancels previous timer with same id.
   * All timers will be canceled when the expressed Interest is satisfied/expired/canceled.
   */
  public setTimer(id: string, timeout: number, f: () => any) {
    this.pi.setTimer(id, timeout, f);
  }

  /** Cancel a timer. */
  public clearTimer(id: string) {
    this.pi.clearTimer(id);
  }

  /** Indicate the requester no longer wants the Data. */
  public cancel() {
    this.pi.cancel();
  }
}
