import type { Blob as NodeBlob } from "node:buffer";

import { type ChunkOptions, type ChunkSource, getMaxChunkSize, KnownSizeChunkSource } from "./common";

/** Generate chunks from a Blob (W3C File API). */
export class BlobChunkSource extends KnownSizeChunkSource implements ChunkSource {
  constructor(private readonly blob: Blob | NodeBlob, opts: ChunkOptions = {}) {
    super(getMaxChunkSize(opts), blob.size);
  }

  protected async getPayload(i: number, offset: number, chunkSize: number): Promise<Uint8Array> {
    void i;
    const sliced = this.blob.slice(offset, offset + chunkSize);
    return new Uint8Array(await sliced.arrayBuffer());
  }
}
