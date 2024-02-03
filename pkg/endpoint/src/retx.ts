import { randomJitter } from "@ndn/util";

/** Interest retransmission policy options. */
export interface RetxOptions {
  /**
   * Maximum number of retransmissions, excluding initial Interest.
   * @defaultValue
   * `0`, which disables retransmissions
   */
  limit?: number;

  /**
   * Initial retx interval
   * @defaultValue
   * 50% of InterestLifetime
   */
  interval?: number;

  /**
   * Randomize retx interval within [1-randomize, 1+randomize].
   * @defaultValue `0.1`
   *
   * @remarks
   * Suppose this is set to `0.1`, an interval of 100ms would become `[90ms,110ms]`.
   */
  randomize?: number;

  /**
   * Multiply retx interval by backoff factor after each retx.
   * @defaultValue `1.0`
   *
   * @remarks
   * Valid range is `[1.0, 2.0]`.
   */
  backoff?: number;

  /**
   * Maximum retx interval.
   * @defaultValue
   * 90% of InterestLifetime
   */
  max?: number;
}

/**
 * Function to generate retransmission intervals.
 *
 * @remarks
 * The generator function is invoked once for each Interest. It should generate successive retx
 * intervals for the given Interest, based on the policy it represents. When the generator ends
 * (no more values from the returned iterable), no more retx is allowed.
 */
export type RetxGenerator = (interestLifetime: number) => Iterable<number>;

/**
 * Interest retransmission policy.
 *
 * @remarks
 * A number is interpreted as {@link RetxOptions.limit} with other options at their defaults.
 * Set `0` to disable retransmissions.
 */
export type RetxPolicy = RetxOptions | RetxGenerator | number;

/** Construct RetxGenerator from RetxPolicy. */
export function makeRetxGenerator(policy: RetxPolicy | undefined): RetxGenerator {
  if (!policy) { // applies to both `undefined` and zero
    return () => [];
  }
  if (typeof policy === "function") {
    return policy;
  }
  if (typeof policy === "number") {
    policy = { limit: policy };
  }

  return function*(interestLifetime: number) {
    const {
      limit = 0,
      interval = interestLifetime * 0.5,
      randomize = 0.1,
      backoff = 1,
      max = interestLifetime * 0.9,
    } = policy as RetxOptions;
    const jitter = randomJitter(randomize);
    let nextInterval = interval;
    for (let i = 0; i < limit; ++i) {
      yield nextInterval * jitter();
      nextInterval = Math.min(nextInterval * backoff, max);
    }
  };
}
