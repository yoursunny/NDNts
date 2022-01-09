import { type ChunkOptions, type ChunkSource, getMaxChunkSize, KnownSizeChunkSource } from "./common";

/** Generate chunks from a fixed buffer. */
export class BufferChunkSource extends KnownSizeChunkSource implements ChunkSource {
  constructor(private readonly input: Uint8Array, opts: ChunkOptions = {}) {
    super(getMaxChunkSize(opts), input.byteLength);
  }

  protected async getPayload(i: number, offset: number, chunkSize: number): Promise<Uint8Array> {
    return this.input.subarray(offset, offset + chunkSize);
  }
}
