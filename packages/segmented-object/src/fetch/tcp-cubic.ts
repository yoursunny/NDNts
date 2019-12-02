import { CongestionAvoidance } from "./congestion-avoidance";

const IW = 2;
const C = 0.4;
const BETACUBIC = 0.7;

/**
 * TCP CUBIC algorithm.
 * @see https://tools.ietf.org/html/rfc8312
 */
export class TcpCubic extends CongestionAvoidance {
  private t0 = 0;
  private cwnd_ = IW;
  private wMax = NaN;
  private k = NaN;
  private ssthresh = Infinity;

  constructor() {
    super(IW);
  }

  public increase(now: number, rtt: number) {
    if (this.cwnd_ < this.ssthresh) { // slow start
      this.cwnd_ += 1;
      this.updateCwnd(this.cwnd_);
      return;
    }

    const t = (now - this.t0) / 1000;
    const rttSeconds = rtt / 1000;
    const wEst = this.computeWEst(t, rttSeconds);
    if (this.computeWCubic(t) < wEst) { // TCP friendly region
      this.cwnd_ = wEst;
      this.updateCwnd(this.cwnd_);
      return;
    }

    // concave region or convex region
    const wCubic = this.computeWCubic(t + rttSeconds);
    this.cwnd_ += (wCubic - this.cwnd_) / this.cwnd_;
    this.updateCwnd(this.cwnd_);
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
    this.cwnd_ *= BETACUBIC;
    this.ssthresh = Math.max(this.cwnd_, 2);
    this.updateCwnd(this.cwnd_);
  }
}
