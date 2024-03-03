import { Forwarder } from "@ndn/fw";
import type { Interest, NameLike } from "@ndn/packet";

import { consume, type ConsumerContext, type ConsumerOptions } from "./consumer";
import { produce, type Producer, type ProducerHandler, type ProducerOptions } from "./producer";

/**
 * {@link Endpoint} constructor options.
 *
 * @remarks
 * This type includes consumer and producer options. These settings will be inherited by
 * {@link Endpoint.consume} and {@link Endpoint.produce} unless overridden.
 */
export interface Options extends ConsumerOptions, ProducerOptions {
}

const cOptsKeys: readonly string[] = [
  "fw", "describe", "signal", "modifyInterest", "retx", "verifier",
] satisfies ReadonlyArray<keyof ConsumerOptions>;

const pOptsKeys: readonly string[] = [
  "fw", "describe", "signal", "routeCapture", "announcement",
  "concurrency", "dataSigner", "dataBuffer", "autoBuffer",
] satisfies ReadonlyArray<keyof ProducerOptions>;

/**
 * Endpoint provides basic consumer and producer functionality. It is the main entry point for an
 * application to interact with the logical forwarder.
 *
 * @remarks
 * Use of this class is discouraged. Please switch to `consume()` and `produce()` standalone
 * functions instead. This class will be deprecated in the future.
 */
export class Endpoint {
  constructor(public readonly opts: Options = {}) {}

  /** Logical forwarder instance. */
  public get fw(): Forwarder {
    return this.opts.fw ?? Forwarder.getDefault();
  }

  public get cOpts(): ConsumerOptions {
    return Object.fromEntries(Object.entries(this.opts).filter(([key]) => cOptsKeys.includes(key)));
  }

  public get pOpts(): ProducerOptions {
    return Object.fromEntries(Object.entries(this.opts).filter(([key]) => pOptsKeys.includes(key)));
  }

  /**
   * Retrieve a single piece of Data.
   * @param interest - Interest or Interest name.
   */
  public consume(interest: Interest | NameLike, opts: ConsumerOptions = {}): ConsumerContext {
    return consume(interest, { ...this.opts, ...opts });
  }

  /**
   * Start a producer.
   * @param prefix - Prefix registration; if `undefined`, prefixes may be added later.
   * @param handler - Function to handle incoming Interest.
   */
  public produce(prefix: NameLike | undefined, handler: ProducerHandler, opts: ProducerOptions = {}): Producer {
    return produce(prefix, handler, { ...this.opts, ...opts });
  }
}

export namespace Endpoint {
  /** Delete default Forwarder instance (mainly for unit testing). */
  export const deleteDefaultForwarder = Forwarder.deleteDefault;

  /** Describe how to derive route announcement from name prefix in {@link Endpoint.produce}. */
  export type RouteAnnouncement = ProducerOptions.RouteAnnouncement;
}
