import { assert } from "@ndn/util";
import { TypedEventTarget } from "typescript-event-target";

type EventMap = {
  cwndupdate: Event;
};

const CWND = Symbol("CongestionAvoidance.CWND");

/** Congestion avoidance algorithm. */
export abstract class CongestionAvoidance extends TypedEventTarget<EventMap> {
  private [CWND]: number;

  constructor(initialCwnd: number) {
    super();
    this[CWND] = initialCwnd;
  }

  public get cwnd() { return this[CWND]; }

  protected updateCwnd(v: number) {
    assert(v >= 0);
    this[CWND] = v;
    this.dispatchTypedEvent("cwndupdate", new Event("cwndupdate"));
  }

  public abstract increase(now: number, rtt: number): void;
  public abstract decrease(now: number): void;
}
