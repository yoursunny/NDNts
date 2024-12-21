import type { Forwarder } from "@ndn/fw";

export interface CommonOptions {
  /**
   * Logical forwarder instance.
   * @defaultValue `Forwarder.getDefault()`
   */
  fw?: Forwarder;

  /**
   * Description for debugging purpose.
   * @defaultValue
   * In a consumer, "consume" + Interest name.
   * In a producer, "produce" + main prefix.
   */
  describe?: string;

  /**
   * AbortSignal that allows cancellation via AbortController.
   *
   * @remarks
   * In a consumer, the promise returned by consume() is rejected.
   * In a producer, the producer is closed.
   */
  signal?: AbortSignal;
}

const commonKeys: readonly string[] = [
  "fw", "describe", "signal",
] satisfies ReadonlyArray<keyof CommonOptions>;

export function exactOptions<O extends CommonOptions>(opts: O, keys: ReadonlyArray<keyof O>): O {
  return Object.fromEntries(Object.entries(opts).filter(
    ([key]) => commonKeys.includes(key) || (keys as readonly string[]).includes(key)),
  ) as O;
}
