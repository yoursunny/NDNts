import { FwFace } from "..";

/** A face that does nothing and remains open. */
export class NoopFace {
  public transform(): AsyncIterable<FwFace.Rxable> {
    return {
      [Symbol.asyncIterator]() {
        return {
          next() {
            // This Promise is neither resolved nor rejected.
            // It would not prevent Node.js from exiting because there are no timers.
            return new Promise<IteratorReturnResult<FwFace.Rxable>>(() => undefined);
          },
        };
      },
    };
  }

  public toString() {
    return "NoopFace";
  }
}
