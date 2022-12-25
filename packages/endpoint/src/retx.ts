import { randomJitter } from "@ndn/util";

/** Interest retransmission policy options. */
export interface RetxOptions {
  /**
   * Maximum number of retransmissions, excluding initial Interest.
   *
   * Default is 0, which disables retransmissions.
   */
  limit?: number;

  /**
   * Initial retx interval
   *
   * Default is 50% of InterestLifetime.
   */
  interval?: number;

  /**
   * Randomize retx interval within [1-randomize, 1+randomize].
   *
   * Suppose this is set to 0.1, an interval of 100ms would become [90ms, 110ms].
   * Default is 0.1.
   */
  randomize?: number;

  /**
   * Multiply retx interval by backoff factor after each retx.
   *
   * This number should be in range [1.0, 2.0].
   * Default is 1.0.
   */
  backoff?: number;

  /**
   * Maximum retx interval.
   *
   * Default is 90% of InterestLifetime.
   */
  max?: number;
}

/** A function to generate retx intervals. */
export type RetxGenerator = (interestLifetime: number) => Iterable<number>;

/**
 * Interest retransmission policy.
 *
 * A number is interpreted as the limit.
 * Set 0 to disable retransmissions.
 */
export type RetxPolicy = RetxOptions | RetxGenerator | number;

/** Construct RetxGenerator from RetxPolicy. */
export function makeRetxGenerator(policy: RetxPolicy | undefined): RetxGenerator {
  if (!policy) {
    return () => [];
  }
  if (typeof policy === "number") {
    return makeRetxGenerator({ limit: policy });
  }
  if (typeof policy === "function") {
    return policy;
  }
  return function*(interestLifetime: number) {
    const {
      limit = 0,
      interval = interestLifetime * 0.5,
      randomize = 0.1,
      backoff = 1,
      max = interestLifetime * 0.9,
    } = policy;
    const jitter = randomJitter(randomize);
    let nextInterval = interval;
    for (let i = 0; i < limit; ++i) {
      yield nextInterval * jitter();
      nextInterval = Math.min(nextInterval * backoff, max);
    }
  };
}
