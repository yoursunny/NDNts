import { assert, concatBuffers } from "@ndn/util";
import { type AnyIterable, collect } from "streaming-iterables";

import { type Chunk, type ChunkOptions, type ChunkSource, getMaxChunkSize, getMinChunkSize } from "./common";

/** Gather chunks of acceptable size from scattered buffers. */
function resize(min: number, max: number): (buf?: Uint8Array) => Iterable<Uint8Array> {
  let vec: Uint8Array[] = [];
  let length = 0;
  return function*(buf) {
    if (!buf) { // final chunk
      return yield concatBuffers(vec, length);
    }

    const total = length + buf.length;
    if (total >= min && total <= max) {
      if (length === 0) {
        yield buf;
      } else {
        vec.push(buf);
        yield concatBuffers(vec, total);
        vec = [];
        length = 0;
      }
      return;
    }

    if (total < min) {
      vec.push(buf);
      length = total;
      return;
    }
    // assert total > max

    let wanted = max - length;
    vec.push(buf.subarray(0, wanted));
    yield concatBuffers(vec, max);

    let off = wanted;
    let rem = buf.length - wanted;
    while (rem >= min) {
      wanted = Math.min(rem, max);
      const end = off + wanted;
      yield buf.subarray(off, end);
      off = end;
      rem -= wanted;
    }

    vec = [buf.subarray(off)];
    length = rem;
  };
}

/**
 * Generate chunks from an Iterable or AsyncIterable of Uint8Arrays.
 * This also accepts NodeJS stream.Readable, which is an AsyncIterable of Buffers.
 */
export class IterableChunkSource implements ChunkSource {
  constructor(input: AnyIterable<Uint8Array> | NodeJS.ReadableStream, opts: ChunkOptions = {}) {
    this.input = input as AnyIterable<Uint8Array>;
    this.minSize = getMinChunkSize(opts);
    this.maxSize = getMaxChunkSize(opts);
  }

  private readonly input: AnyIterable<Uint8Array>;
  private readonly minSize: number;
  private readonly maxSize: number;

  public async *listChunks(): AsyncIterable<Chunk> {
    let i = -1;
    const resizer = resize(this.minSize, this.maxSize);
    for await (const buf of this.input) {
      assert(buf instanceof Uint8Array);
      for (const payload of resizer(buf)) {
        ++i;
        yield { i, payload };
      }
    }
    ++i;
    yield { i, final: i, payload: collect(resizer())[0]! };
  }
}

/** Alias of IterableChunkSource, which accepts NodeJS stream.Readable. */
export const StreamChunkSource = IterableChunkSource;
