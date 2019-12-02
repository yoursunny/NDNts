import { CongestionAvoidance } from "./congestion-avoidance";

export class LimitedCwnd extends CongestionAvoidance {
  constructor(
    private readonly inner: CongestionAvoidance,
    maxCwnd = Infinity,
  ) {
    super(inner.cwnd);
    inner.on("cwndupdate", (v) => this.updateCwnd(Math.min(maxCwnd, v)));
  }

  public increase(now: number, rtt: number) {
    this.inner.increase(now, rtt);
  }

  public decrease(now: number) {
    this.inner.decrease(now);
  }
}
