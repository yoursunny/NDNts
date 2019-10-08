import { Pit } from "@ndn/fw";
import { LLFace } from "@ndn/llface";

export class EndpointImpl {
  constructor(public readonly llface: LLFace, public readonly pit: Pit) {
    this.llface.on("data", (data) => this.pit.processData(data, ""));
  }
}
