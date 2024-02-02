import { CongestionAvoidance } from "./congestion-avoidance";

/**
 * TCP CUBIC algorithm.
 * @see {@link https://datatracker.ietf.org/doc/html/rfc8312}
 */
export class TcpCubic extends CongestionAvoidance {
  private readonly c: number;
  private readonly betaCubic: number;
  private readonly alphaAimd: number;
  private t0 = 0;
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
    this.c = c;
    this.betaCubic = betaCubic;
    this.alphaAimd = 3 * (1 - betaCubic) / (1 + betaCubic);
  }

  public override increase(now: number, rtt: number) {
    if (now < this.t0) {
      // increase and decrease processed out-of-order, t would be negative
      return;
    }

    const { cwnd } = this;
    if (cwnd < this.ssthresh) { // slow start
      this.updateCwnd(cwnd + 1);
      return;
    }

    const t = (now - this.t0) / 1000;
    rtt /= 1000;
    const wCubic = this.c * (t - this.k) ** 3 + this.wMax;
    const wEst = this.wMax * this.betaCubic + this.alphaAimd * (t / rtt);
    if (wCubic < wEst) { // TCP friendly region
      this.updateCwnd(wEst);
      return;
    }

    // concave region or convex region
    // note: RFC8312 specifies `(W_cubic(t+RTT) - cwnd) / cwnd`, but NDN-DPDK benchmark shows
    //       that using `(W_cubic(t) - cwnd) / cwnd` increases throughput by 10%
    this.updateCwnd(cwnd + (wCubic - cwnd) / cwnd);
  }

  public override decrease(now: number) {
    this.t0 = now;
    let { cwnd } = this;
    if (cwnd < this.wLastMax) {
      this.wLastMax = cwnd;
      this.wMax = cwnd * (1 + this.betaCubic) / 2;
    } else {
      this.wMax = cwnd;
      this.wLastMax = cwnd;
    }
    this.k = Math.cbrt(this.wMax * (1 - this.betaCubic) / this.c);
    cwnd *= this.betaCubic;
    this.ssthresh = Math.max(cwnd, 2);
    this.updateCwnd(cwnd);
  }
}

export namespace TcpCubic {
  export interface Options {
    /**
     * Initial congestion window.
     * @defaultValue 2
     */
    iw?: number;

    /**
     * CUBIC parameter C.
     * @defaultValue 0.4
     */
    c?: number;

    /**
     * CUBIC parameter beta_cubic.
     * @defaultValue 0.7
     */
    betaCubic?: number;
  }
}
