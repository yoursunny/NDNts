import { FwFace } from "../src";

export class NoopFace {
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  public async *transform(): AsyncGenerator<FwFace.Rxable> {}

  public toString() {
    return "NoopFace";
  }
}
