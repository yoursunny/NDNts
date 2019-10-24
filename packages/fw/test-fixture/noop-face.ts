import { FwFace } from "../src";

export class NoopFace {
  // tslint:disable-next-line:no-empty
  public async *transform(): AsyncGenerator<FwFace.Rxable> {}

  public toString() {
    return "NoopFace";
  }
}
