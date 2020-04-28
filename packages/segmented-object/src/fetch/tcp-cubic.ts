import { CongestionAvoidance } from "./congestion-avoidance";

const IW = 2;
const C = 0.4;
const BETACUBIC = 0.7;
const ALPHA_AIMD = 3 * (1 - BETACUBIC) / (1 + BETACUBIC);

/**
 * TCP CUBIC algorithm.
 * @see https://tools.ietf.org/html/rfc8312
 */
export class TcpCubic extends CongestionAvoidance {
  private t0 = 0;
  private cwnd_ = IW;
  private wMax = 0;
  private wLastMax = 0;
  private k = Number.NaN;
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
    rtt /= 1000;
    const wCubic = C * (t - this.k) ** 3 + this.wMax;
    const wEst = this.wMax * BETACUBIC + ALPHA_AIMD * (t / rtt);
    if (wCubic < wEst) { // TCP friendly region
      this.cwnd_ = wEst;
      this.updateCwnd(this.cwnd_);
      return;
    }

    // concave region or convex region
    // note: RFC8312 specifies `(W_cubic(t+RTT) - cwnd) / cwnd`, but NDN-DPDK benchmark shows
    //       that using `(W_cubic(t) - cwnd) / cwnd` increases throughput by 10%
    this.cwnd_ += (wCubic - this.cwnd_) / this.cwnd_;
    this.updateCwnd(this.cwnd_);
  }

  public decrease(now: number) {
    this.t0 = now;
    if (this.cwnd_ < this.wLastMax) {
      this.wLastMax = this.cwnd_;
      this.wMax = this.cwnd_ + (1 + BETACUBIC) / 2;
    } else {
      this.wMax = this.cwnd_;
      this.wLastMax = this.cwnd_;
    }
    this.k = Math.cbrt(this.wMax * (1 - BETACUBIC) / C);
    this.cwnd_ *= BETACUBIC;
    this.ssthresh = Math.max(this.cwnd_, 2);
    this.updateCwnd(this.cwnd_);
  }
}
