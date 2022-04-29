/* eslint-env browser */

import { type ChunkOptions, type ChunkSource, getMaxChunkSize, KnownSizeChunkSource } from "./common";

/** Generate chunks from a Blob (from W3C File API, browser only). */
export class BlobChunkSource extends KnownSizeChunkSource implements ChunkSource {
  constructor(private readonly blob: Blob, opts: ChunkOptions = {}) {
    super(getMaxChunkSize(opts), blob.size);
  }

  protected async getPayload(i: number, offset: number, chunkSize: number): Promise<Uint8Array> {
    void i;
    const sliced = this.blob.slice(offset, offset + chunkSize);
    const buffer = await sliced.arrayBuffer();
    return new Uint8Array(buffer);
  }
}
