import { Chunk, ChunkOptions, ChunkSource, getMaxChunkSize } from "./common";

/** Generate chunks from a fixed buffer. */
export class BufferChunkSource implements ChunkSource {
  private readonly chunkSize: number;
  private readonly final: number;

  constructor(private readonly input: Uint8Array, opts: ChunkOptions = {}) {
    this.chunkSize = getMaxChunkSize(opts);
    this.final = Math.max(0, Math.ceil(input.byteLength / this.chunkSize) - 1);
  }

  public *listChunks(): Iterable<Chunk> {
    for (let i = 0; i <= this.final; ++i) {
      yield this.makeChunk(i);
    }
  }

  public getChunk(i: number) {
    if (i > this.final) {
      return Promise.resolve(undefined);
    }
    return Promise.resolve(this.makeChunk(i));
  }

  private makeChunk(i: number): Chunk {
    const offset = i * this.chunkSize;
    return {
      i,
      final: this.final,
      payload: this.input.subarray(offset, offset + this.chunkSize),
    };
  }
}
