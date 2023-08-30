import { assert } from "@ndn/util";
import { TypedEventTarget } from "typescript-event-target";

type EventMap = {
  cwndupdate: Event;
};

/** Congestion avoidance algorithm. */
export abstract class CongestionAvoidance extends TypedEventTarget<EventMap> {
  private cwnd_: number;

  constructor(initialCwnd: number) {
    super();
    this.cwnd_ = initialCwnd;
  }

  public get cwnd() { return this.cwnd_; }

  protected updateCwnd(v: number) {
    assert(v >= 0);
    this.cwnd_ = v;
    this.dispatchTypedEvent("cwndupdate", new Event("cwndupdate"));
  }

  public abstract increase(now: number, rtt: number): void;
  public abstract decrease(now: number): void;
}
