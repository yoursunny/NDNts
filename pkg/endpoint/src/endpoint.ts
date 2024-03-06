import { Forwarder } from "@ndn/fw";
import type { Interest, NameLike } from "@ndn/packet";

import { consume, type ConsumerContext, ConsumerOptions } from "./consumer";
import { produce, type Producer, type ProducerHandler, ProducerOptions } from "./producer";

/**
 * {@link Endpoint} constructor options.
 *
 * @remarks
 * This type includes consumer and producer options. These settings will be inherited by
 * {@link Endpoint.consume} and {@link Endpoint.produce} unless overridden.
 */
export interface Options extends ConsumerOptions, ProducerOptions {
}

/**
 * Endpoint provides basic consumer and producer functionality. It is the main entry point for an
 * application to interact with the logical forwarder.
 */
export class Endpoint {
  /**
   * Constructor.
   * @deprecated Use {@link consume} and {@link produce} standalone functions.
   */
  constructor(public readonly opts: Options = {}) {}

  /** Logical forwarder instance. */
  public get fw(): Forwarder {
    return this.opts.fw ?? Forwarder.getDefault();
  }

  public get cOpts(): ConsumerOptions {
    return ConsumerOptions.exact(this.opts);
  }

  public get pOpts(): ProducerOptions {
    return ProducerOptions.exact(this.opts);
  }

  /**
   * Retrieve a single piece of Data.
   * @param interest - Interest or Interest name.
   * @deprecated Use {@link consume} standalone function.
   */
  public consume(interest: Interest | NameLike, opts: ConsumerOptions = {}): ConsumerContext {
    return consume(interest, { ...this.opts, ...opts });
  }

  /**
   * Start a producer.
   * @param prefix - Prefix registration; if `undefined`, prefixes may be added later.
   * @param handler - Function to handle incoming Interest.
   * @deprecated Use {@link produce} standalone function.
   */
  public produce(prefix: NameLike | undefined, handler: ProducerHandler, opts: ProducerOptions = {}): Producer {
    return produce(prefix, handler, { ...this.opts, ...opts });
  }
}

export namespace Endpoint {
  /**
   * Delete default Forwarder instance (mainly for unit testing).
   * @deprecated Use `Forwarder.deleteDefault`.
   */
  export const deleteDefaultForwarder = Forwarder.deleteDefault;

  /**
   * Describe how to derive route announcement from name prefix in {@link Endpoint.produce}.
   * @deprecated Use `ProducerOptions.RouteAnnouncement`.
   */
  export type RouteAnnouncement = ProducerOptions.RouteAnnouncement;
}
