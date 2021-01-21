import type { AnyIterable } from "streaming-iterables";

import { Chunk, ChunkOptions, ChunkSource, getMaxChunkSize, getMinChunkSize } from "./common";

/** Gather chunks of acceptable size from scattered buffers. */
class ScatteredChunk {
  constructor(private readonly minSize: number, private readonly maxSize: number) {}

  private vector: Uint8Array[] = [];
  private length = 0;

  public append(buf: Uint8Array) {
    this.vector.push(buf);
    this.length += buf.byteLength;
  }

  public gather(ignoreMinSize = false): Uint8Array|undefined {
    if (!ignoreMinSize && this.length < this.minSize) {
      return undefined;
    }
    if (this.length === 0) { // implies ignoreMinSize
      return new Uint8Array();
    }

    // fast path when first buffer has acceptable size
    const firstSize = this.vector[0]!.byteLength;
    if (firstSize >= this.minSize && firstSize <= this.maxSize) {
      this.length -= firstSize;
      return this.vector.shift()!;
    }

    const output = new Uint8Array(Math.min(this.maxSize, this.length));
    for (let offset = 0; offset < output.byteLength;) {
      const buf = this.vector.shift()!;
      this.length -= buf.byteLength;
      const rem = output.byteLength - offset;
      if (buf.byteLength > rem) {
        output.set(buf.subarray(0, rem), offset);
        offset += rem;
        const excess = buf.subarray(rem);
        this.vector.unshift(excess);
        this.length += excess.byteLength;
      } else {
        output.set(buf, offset);
        offset += buf.byteLength;
      }
    }
    return output;
  }
}

/** Generate chunks from an Iterable or AsyncIterable of Uint8Arrays. */
export class IterableChunkSource implements ChunkSource {
  constructor(private readonly input: AnyIterable<Uint8Array>,
      private readonly opts: ChunkOptions = {}) {}

  public async *listChunks(): AsyncIterable<Chunk> {
    let i = -1;
    const scattered = new ScatteredChunk(getMinChunkSize(this.opts), getMaxChunkSize(this.opts));
    for await (const buf of this.input) {
      scattered.append(buf);
      for (;;) {
        const payload = scattered.gather();
        if (!payload) {
          break;
        }
        ++i;
        yield { i, payload };
      }
    }
    ++i;
    yield { i, final: i, payload: scattered.gather(true)! };
  }
}
