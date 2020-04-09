interface Parameters {
  k: number;
  alpha: number;
  beta: number;
  initRto: number;
  minRto: number;
  maxRto: number;
}

const defaultParameters: Parameters = {
  k: 4,
  alpha: 1 / 8,
  beta: 1 / 4,
  initRto: 1000,
  minRto: 200,
  maxRto: 60000,
};

/**
 * RTT estimator.
 * @see https://tools.ietf.org/html/rfc6298
 */
export class RttEstimator {
  private params: Parameters;
  private sRtt_ = Number.NaN;
  private rttVar = Number.NaN;
  private rto_: number;

  constructor(opts: RttEstimator.Options = {}) {
    this.params = { ...defaultParameters, ...opts };
    this.rto_ = this.params.initRto;
  }

  public get sRtt() { return this.sRtt_; }
  public get rto() { return this.rto_; }

  public push(rtt: number, nPending = 1) {
    if (Number.isNaN(this.rttVar)) {
      this.sRtt_ = rtt;
      this.rttVar = rtt / 2;
    } else {
      const alpha = this.params.alpha / nPending;
      const beta = this.params.beta / nPending;
      this.rttVar = (1 - beta) * this.rttVar + beta * Math.abs(this.sRtt_ - rtt);
      this.sRtt_ = (1 - alpha) * this.sRtt_ + alpha * rtt;
    }
    this.rto_ = this.clampRto(this.sRtt_ + this.params.k * this.rttVar);
  }

  public backoff() {
    this.rto_ = this.clampRto(this.rto_ * 2);
  }

  private clampRto(rto: number) {
    return Math.max(this.params.minRto, Math.min(rto, this.params.maxRto));
  }
}

export namespace RttEstimator {
  export type Options = Partial<Parameters>;
}
