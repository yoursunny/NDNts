import type { FwFace, FwPacket } from "..";

/** A face that does nothing and remains open. */
export class NoopFace implements FwFace.RxTxDuplex {
  public attributes = {
    describe: "NoopFace",
  };

  public async *duplex(): AsyncIterable<FwPacket> { // eslint-disable-line require-yield
    await new Promise<void>(() => undefined);
  }
}
