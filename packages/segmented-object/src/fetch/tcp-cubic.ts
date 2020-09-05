import { CongestionAvoidance } from "./congestion-avoidance";

/**
 * TCP CUBIC algorithm.
 * @see https://tools.ietf.org/html/rfc8312
 */
export class TcpCubic extends CongestionAvoidance {
  private readonly c: number;
  private readonly betaCubic: number;
  private readonly alphaAimd: number;
  private t0 = 0;
  private cwnd_: number;
  private wMax = 0;
  private wLastMax = 0;
  private k = Number.NaN;
  private ssthresh = Infinity;

  constructor({
    iw = 2,
    c = 0.4,
    betaCubic = 0.7,
  }: TcpCubic.Options = {}) {
    super(iw);
    this.cwnd_ = iw;
    this.c = c;
    this.betaCubic = betaCubic;
    this.alphaAimd = 3 * (1 - betaCubic) / (1 + betaCubic);
  }

  public increase(now: number, rtt: number) {
    if (this.cwnd_ < this.ssthresh) { // slow start
      this.cwnd_ += 1;
      this.updateCwnd(this.cwnd_);
      return;
    }

    const t = (now - this.t0) / 1000;
    rtt /= 1000;
    const wCubic = this.c * (t - this.k) ** 3 + this.wMax;
    const wEst = this.wMax * this.betaCubic + this.alphaAimd * (t / rtt);
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
      this.wMax = this.cwnd_ * (1 + this.betaCubic) / 2;
    } else {
      this.wMax = this.cwnd_;
      this.wLastMax = this.cwnd_;
    }
    this.k = Math.cbrt(this.wMax * (1 - this.betaCubic) / this.c);
    this.cwnd_ *= this.betaCubic;
    this.ssthresh = Math.max(this.cwnd_, 2);
    this.updateCwnd(this.cwnd_);
  }
}

export namespace TcpCubic {
  export interface Options {
    /** Initial window. Default is 2. */
    iw?: number;
    /** CUBIC parameter C. Default is 0.4. */
    c?: number;
    /** CUBIC parameter beta_cubic. Default is 0.7. */
    betaCubic?: number;
  }
}
