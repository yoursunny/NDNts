import { Interest } from "@ndn/l3pkt";
import { LLFace, Transport } from "@ndn/llface";
import { LinearPit, Pit } from "@ndn/pit";

import { ExpressedInterest } from "./expressed-interest";
import { EndpointImpl } from "./internal";

/** Endpoint for application to communicate with NDN network. */
export class Endpoint {
  private readonly id: string = Math.random().toString();
  private readonly impl: EndpointImpl;

  constructor(transport: Transport, pit: Pit = new LinearPit()) {
    this.impl = new EndpointImpl(new LLFace(transport), pit);
  }

  public expressInterest(interest: Interest): ExpressedInterest {
    const pi = this.impl.pit.addInterest(interest, this.id)!;
    return new ExpressedInterest(this.impl, pi!);
  }
}
