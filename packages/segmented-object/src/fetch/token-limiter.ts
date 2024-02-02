import { assert } from "@ndn/util";

/** A token-based throttle limiter. */
export class TokenLimiter {
  private readonly queue = new Set<() => void>();
  private nTaken_ = 0;

  constructor(private capacity_ = 0) {}

  /** How many callers are waiting for a token. */
  public get nWaiting() { return this.queue.size; }

  /** How many tokens are currently taken. */
  public get nTaken() { return this.nTaken_; }

  /** Capacity of the token bucket. */
  public get capacity() { return this.capacity_; }

  /** Change total number of tokens. */
  public set capacity(v) {
    assert(v >= 0);
    this.capacity_ = Math.trunc(v);
    this.unblock();
  }

  /** Wait to take a token. */
  public take(): Promise<void> {
    return new Promise<void>((resolve) => {
      this.queue.add(resolve);
      this.unblock();
    });
  }

  /** Return one or more tokens. */
  public put(n = 1) {
    this.nTaken_ -= n;
    this.unblock();
  }

  private unblock() {
    for (const fulfill of this.queue) {
      if (this.nTaken_ >= this.capacity_) {
        break;
      }
      ++this.nTaken_;
      this.queue.delete(fulfill);
      fulfill();
    }
  }
}
