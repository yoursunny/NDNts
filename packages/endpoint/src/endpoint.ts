import { Interest } from "@ndn/l3pkt";
import { LLFace, Transport } from "@ndn/llface";
import { LinearPit, Pit } from "@ndn/pit";
import assert from "minimalistic-assert";

import { ExpressedInterest } from "./expressed-interest";

/** Endpoint for application to communicate with NDN network. */
export class Endpoint {
  private readonly llface: LLFace;

  constructor(transport: Transport, private readonly pit: Pit = new LinearPit()) {
    this.llface = new LLFace(transport);
    this.llface.on("data", (data) => this.pit.processData(data, ""));
  }

  public expressInterest(interest: Interest): ExpressedInterest {
    const pi = this.pit.addInterest(interest, "");
    assert(typeof pi !== "undefined");
    this.llface.sendInterest(interest);
    return new ExpressedInterest(pi!);
  }
}
