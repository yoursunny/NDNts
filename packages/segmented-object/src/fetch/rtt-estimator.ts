const K = 4;
const ALPHA = 1 / 8;
const BETA = 1 / 4;
const INITRTO = 1000;
const MINRTO = 200;
const MAXRTO = 60000;

function clampRto(rto: number) {
  return Math.max(MINRTO, Math.min(rto, MAXRTO));
}

/**
 * RTT estimator.
 * @see https://tools.ietf.org/html/rfc6298
 */
export class RttEstimator {
  private sRtt_ = NaN;
  private rttVar = NaN;
  private rto_ = INITRTO;

  public get sRtt() { return this.sRtt_; }
  public get rto() { return this.rto_; }

  public push(rtt: number, nPending: number = 1) {
    if (isNaN(this.rttVar)) {
      this.sRtt_ = rtt;
      this.rttVar = rtt / 2;
    } else {
      const alpha = ALPHA / nPending;
      const beta = BETA / nPending;
      this.rttVar = (1 - beta) * this.rttVar + beta * Math.abs(this.sRtt_ - rtt);
      this.sRtt_ = (1 - alpha) * this.sRtt_ + alpha * rtt;
    }
    this.rto_ = clampRto(this.sRtt_ + K * this.rttVar);
  }

  public backoff() {
    this.rto_ = clampRto(this.rto_ * 2);
  }
}
