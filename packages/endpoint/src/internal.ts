import { LLFace } from "@ndn/llface";
import { Pit } from "@ndn/pit";

export class EndpointImpl {
  constructor(public readonly llface: LLFace, public readonly pit: Pit) {
    this.llface.on("data", (data) => this.pit.processData(data, ""));
  }
}
