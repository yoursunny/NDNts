import { Forwarder, type FwFace } from "@ndn/fw";
import { Interest, Name, type NameLike } from "@ndn/packet";

import { type ConsumerContext, type ConsumerOptions, makeConsumer } from "./consumer";
import { type Producer, type ProducerHandler, ProducerImpl, type ProducerOptions } from "./producer";

/**
 * {@link Endpoint} constructor options.
 *
 * @remarks
 * This type includes consumer and producer options. These settings will be inherited by
 * {@link Endpoint.consume} and {@link Endpoint.produce} unless overridden.
 */
export interface Options extends ConsumerOptions, ProducerOptions {
  /**
   * Logical forwarder instance.
   * @defaultValue `Forwarder.getDefault()`
   */
  fw?: Forwarder;
}

/**
 * Endpoint provides basic consumer and producer functionality. It is the main entry point for an
 * application to interact with the logical forwarder.
 */
export class Endpoint {
  constructor(public readonly opts: Options = {}) {
    this.fw = opts.fw ?? Forwarder.getDefault();
  }

  /** Logical forwarder instance. */
  public readonly fw: Forwarder;

  /**
   * Retrieve a single piece of Data.
   * @param interest - Interest or Interest name.
   */
  public consume(interest: Interest | NameLike, opts: ConsumerOptions = {}): ConsumerContext {
    return makeConsumer(
      this.fw,
      interest instanceof Interest ? interest : new Interest(interest),
      { ...this.opts, ...opts },
    );
  }

  /**
   * Start a producer.
   * @param prefix - Prefix registration; if `undefined`, prefixes may be added later.
   * @param handler - Function to handle incoming Interest.
   */
  public produce(prefix: NameLike | undefined, handler: ProducerHandler, opts: ProducerOptions = {}): Producer {
    return new ProducerImpl(
      this.fw,
      prefix === undefined ? undefined : Name.from(prefix),
      handler,
      { ...this.opts, ...opts },
    );
  }
}

export namespace Endpoint {
  /** Delete default Forwarder instance (mainly for unit testing). */
  export const deleteDefaultForwarder = Forwarder.deleteDefault;

  /** Describe how to derive route announcement from name prefix in {@link Endpoint.produce}. */
  export type RouteAnnouncement = FwFace.RouteAnnouncement;
}
