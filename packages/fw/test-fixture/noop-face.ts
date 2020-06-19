import type { FwFace, FwPacket } from "..";

/** A face that does nothing and remains open. */
export class NoopFace implements FwFace.RxTxTransform {
  public attributes = {
    describe: "NoopFace",
  };

  public transform(): AsyncIterable<FwPacket> {
    return {
      [Symbol.asyncIterator]() {
        return {
          next() {
            // This Promise is neither resolved nor rejected.
            // It would not prevent Node.js from exiting because there are no timers.
            return new Promise<IteratorReturnResult<FwPacket>>(() => undefined);
          },
        };
      },
    };
  }
}
