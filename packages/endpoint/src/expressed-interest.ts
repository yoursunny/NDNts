import { PendingInterest } from "@ndn/pit";
import { EventEmitter } from "events";
import { StrictEventEmitter } from "strict-event-emitter-types";

import { EndpointImpl } from "./internal";

type Emitter = StrictEventEmitter<EventEmitter, PendingInterest.Events>;

export class ExpressedInterest extends (EventEmitter as new() => Emitter) {
  public get interest() { return this.pi.interest; }
  public get promise() { return this.pi.promise; }
  public get nRetx() { return this.nRetx_; }

  private nRetx_: number = 0;

  constructor(private readonly ep: EndpointImpl, private readonly pi: PendingInterest) {
    super();
    pi.on("data", (data) => this.emit("data", data));
    pi.on("expire", () => this.emit("expire"));
    pi.on("cancel", () => this.emit("cancel"));
    this.ep.llface.sendInterest(this.interest);
  }

  /**
   * Schedule a timer associated with this expressed Interest.
   * This cancels previous timer with same id.
   * All timers will be canceled when Interest is satisfied/expired/canceled.
   */
  public setTimer(id: string, timeout: number, f: () => any) {
    this.pi.setTimer(id, timeout, f);
  }

  /** Cancel a timer. */
  public clearTimer(id: string) {
    this.pi.clearTimer(id);
  }

  /**
   * Retransmit the Interest.
   * This is only permitted before InterestLifetime expires.
   * @returns true if retransmitted, false if entry is satisfied/expired/canceled.
   */
  public retransmit(): boolean {
    if (!this.pi.adjustInterestLifetime()) {
      return false;
    }
    ++this.nRetx_;
    this.ep.llface.sendInterest(this.interest);
    return true;
  }

  /** Indicate the requester no longer wants the Data. */
  public cancel() {
    this.pi.cancel();
  }
}
