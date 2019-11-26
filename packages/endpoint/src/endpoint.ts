import { Forwarder } from "@ndn/fw";
import applyMixins from "applymixins";

import { EndpointConsumer } from "./consumer";
import { EndpointProducer } from "./producer";

export class Endpoint {
  constructor(public readonly fw: Forwarder = Forwarder.getDefault()) {
  }
}
export interface Endpoint extends EndpointConsumer, EndpointProducer {}
applyMixins(Endpoint, [EndpointConsumer, EndpointProducer]);

export namespace Endpoint {
  /** Delete default Forwarder instance (mainly for unit testing). */
  export const deleteDefaultForwarder = Forwarder.deleteDefault;
}
