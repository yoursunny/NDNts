import { assert } from "@ndn/util";
import type { AnyIterable } from "streaming-iterables";

import { type Chunk, type ChunkOptions, type ChunkSource, getMaxChunkSize, getMinChunkSize } from "./common";

/** Gather chunks of acceptable size from scattered buffers. */
class ScatteredChunk {
  constructor(private readonly minSize: number, private readonly maxSize: number) {}

  private readonly vector: Uint8Array[] = [];
  private length = 0;

  public append(buf: Uint8Array) {
    this.vector.push(buf);
    this.length += buf.byteLength;
  }

  public gather(ignoreMinSize = false): Uint8Array | undefined {
    if (!ignoreMinSize && this.length < this.minSize) {
      return undefined;
    }
    if (this.length === 0) { // implies ignoreMinSize
      return new Uint8Array();
    }

    // fast path when first buffer has acceptable size
    let buf = this.vector[0]!;
    if (buf.byteLength >= this.minSize && buf.byteLength <= this.maxSize) {
      this.length -= buf.byteLength;
      return this.vector.shift()!;
    }

    // fast path when first buffer has enough payload
    if (buf.byteLength > this.maxSize) {
      const output = buf.subarray(0, this.maxSize);
      this.length -= this.maxSize;
      this.vector[0] = buf.subarray(this.maxSize);
      return output;
    }

    // slow path that combines multiple buffers
    const output = new Uint8Array(Math.min(this.maxSize, this.length));
    for (let offset = 0; offset < output.byteLength;) {
      buf = this.vector[0]!;
      const rem = output.byteLength - offset;
      if (buf.byteLength > rem) {
        output.set(buf.subarray(0, rem), offset);
        offset += rem;
        this.vector[0] = buf.subarray(rem);
      } else {
        output.set(buf, offset);
        offset += buf.byteLength;
        this.vector.shift();
      }
    }
    this.length -= output.byteLength;
    return output;
  }
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
    const scattered = new ScatteredChunk(this.minSize, this.maxSize);
    for await (const buf of this.input) {
      assert(buf instanceof Uint8Array);
      scattered.append(buf);
      let payload: Uint8Array | undefined;
      while (payload = scattered.gather()) { // eslint-disable-line no-cond-assign
        ++i;
        yield { i, payload };
      }
    }
    ++i;
    yield { i, final: i, payload: scattered.gather(true)! };
  }
}

/** Alias of IterableChunkSource, which accepts NodeJS stream.Readable. */
export const StreamChunkSource = IterableChunkSource;
