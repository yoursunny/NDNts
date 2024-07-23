import { assert } from "@ndn/util";
import { TypedEventTarget } from "typescript-event-target";

type EventMap = {
  cwndupdate: Event;
};

/** Congestion avoidance algorithm. */
export abstract class CongestionAvoidance extends TypedEventTarget<EventMap> {
  private cwnd_: number;

  /**
   * Constructor.
   * @param initialCwnd - Initial congestion window.
   */
  constructor(initialCwnd: number) {
    super();
    this.cwnd_ = initialCwnd;
  }

  /** Congestion window. */
  public get cwnd() { return this.cwnd_; }

  protected updateCwnd(v: number) {
    assert(Number.isFinite(v));
    assert(v >= 0);
    this.cwnd_ = v;
    this.dispatchTypedEvent("cwndupdate", new Event("cwndupdate"));
  }

  /**
   * Increase congestion window.
   * @param now - Timestamp of positive feedback (successful retrieval without congestion mark).
   * @param rtt - Round-trip time when the positive feedback is received.
   */
  public abstract increase(now: number, rtt: number): void;

  /**
   * Decrease congestion window upon negative feedback (loss or congestion mark).
   * @param now - Timestamp of negative feedback.
   */
  public abstract decrease(now: number): void;
}
