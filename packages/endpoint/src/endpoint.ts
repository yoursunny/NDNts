import { Forwarder } from "@ndn/fw";
import applyMixins from "applymixins";

import { type ConsumerOptions, EndpointConsumer } from "./consumer";
import { EndpointProducer, type ProducerOptions } from "./producer";

export interface Options extends ConsumerOptions, ProducerOptions {
  fw?: Forwarder;
}

/**
 * Endpoint is the main entry point for an application to interact with the forwarding plane.
 * It provides basic consumer and producer functionality.
 */
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class Endpoint {
  public readonly fw: Forwarder;

  constructor(public readonly opts: Options = {}) {
    this.fw = opts.fw ?? Forwarder.getDefault();
  }
}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface Endpoint extends EndpointConsumer, EndpointProducer {}
applyMixins(Endpoint, [EndpointConsumer, EndpointProducer]);

export namespace Endpoint {
  /** Delete default Forwarder instance (mainly for unit testing). */
  export const deleteDefaultForwarder = Forwarder.deleteDefault;

  export type RouteAnnouncement = EndpointProducer.RouteAnnouncement;
}
