import isStream from "is-stream";
import { fromStream } from "streaming-iterables";

function makeInputIterator(input: chunker.Input): AsyncIterable<Uint8Array> {
  if ((isStream.readable as (obj) => obj is NodeJS.ReadableStream)(input)) {
    return fromStream(input);
  }
  if (input instanceof Uint8Array) {
    return (async function*() {
      yield input;
    })();
  }
  return input;
}

/**
 * Slice input into chunks no larger than chunkSize.
 *
 * Current implementation does not have minimum chunk size limit, and could yield very small chunks.
 */
export async function* chunker(input: chunker.Input, chunkSize: number): AsyncGenerator<Uint8Array> {
  for await (const buffer of makeInputIterator(input)) {
    for (let i = 0; i < buffer.length; i += chunkSize) {
      yield buffer.subarray(i, i + chunkSize);
    }
  }
}

export namespace chunker {
  export type Input = Uint8Array | AsyncIterable<Uint8Array> | NodeJS.ReadableStream;
}
