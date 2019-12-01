import { EventEmitter } from "events";
import StrictEventEmitter from "strict-event-emitter-types";

const IW = 2;
const C = 0.4;
const BETACUBIC = 0.7;

interface Events {
  cwndupdate: number;
}

type Emitter = StrictEventEmitter<EventEmitter, Events>;

/**
 * TCP CUBIC algorithm.
 * @see https://tools.ietf.org/html/rfc8312
 */
export class TcpCubic extends (EventEmitter as new() => Emitter) {
  private t0 = 0;
  private cwnd_ = IW;
  private wMax = NaN;
  private k = NaN;
  private ssthresh = Infinity;

  public get cwnd() { return this.cwnd_; }

  private updateCwnd(v: number) {
    this.cwnd_ = v;
    this.emit("cwndupdate", this.cwnd_);
  }

  public increase(now: number, rtt: number) {
    if (this.cwnd_ < this.ssthresh) { // slow start
      this.updateCwnd(this.cwnd_ + 1);
      return;
    }

    const t = (now - this.t0) / 1000;
    const rttSeconds = rtt / 1000;
    const wEst = this.computeWEst(t, rttSeconds);
    if (this.computeWCubic(t) < wEst) { // TCP friendly region
      this.updateCwnd(wEst);
      return;
    }

    // concave region or convex region
    const wCubic = this.computeWCubic(t + rttSeconds);
    this.updateCwnd(this.cwnd_ + (wCubic - this.cwnd_) / this.cwnd_);
  }

  private computeWCubic(t: number) {
    return C * (t - this.k) ** 3 + this.wMax;
  }

  private computeWEst(t: number, rtt: number) {
    return this.wMax * BETACUBIC + (3 * (1 - BETACUBIC) / (1 + BETACUBIC)) * (t / rtt);
  }

  public decrease(now: number) {
    this.t0 = now;
    this.wMax = this.cwnd_;
    this.k = Math.cbrt(this.wMax * (1 - BETACUBIC) / C);
    const cwnd = this.cwnd_ * BETACUBIC;
    this.ssthresh = Math.max(cwnd, 2);
    this.updateCwnd(cwnd);
  }
}
