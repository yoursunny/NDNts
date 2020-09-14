import { EventEmitter } from "events";
import assert from "minimalistic-assert";
import type TypedEmitter from "typed-emitter";

interface Events {
  cwndupdate: (cwnd: number) => void;
}

const CWND = Symbol("CongestionAvoidance.CWND");

/** Congestion avoidance algorithm. */
export abstract class CongestionAvoidance extends (EventEmitter as new() => TypedEmitter<Events>) {
  private [CWND]: number;

  constructor(initialCwnd: number) {
    super();
    this[CWND] = initialCwnd;
  }

  public get cwnd() { return this[CWND]; }

  protected updateCwnd(v: number) {
    assert(v >= 0);
    this[CWND] = v;
    this.emit("cwndupdate", v);
  }

  public abstract increase(now: number, rtt: number): void;
  public abstract decrease(now: number): void;
}
