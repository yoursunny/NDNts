/* eslint-env browser */

import { type ChunkOptions, type ChunkSource, getMaxChunkSize, KnownSizeChunkSource } from "./common";

function readBlobAsBuffer(blob: Blob): Promise<ArrayBuffer> {
  return blob.arrayBuffer();
}

function readBlobFileReader(blob: Blob): Promise<ArrayBuffer> {
  return new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsArrayBuffer(blob);
    reader.addEventListener("load", () => {
      const buffer = reader.result as ArrayBuffer;
      resolve(buffer);
    });
    reader.addEventListener("error", () => {
      reject(reader.error);
    });
  });
}

/** Generate chunks from a Blob (from W3C File API, browser only). */
export class BlobChunkSource extends KnownSizeChunkSource implements ChunkSource {
  constructor(private readonly blob: Blob, opts: ChunkOptions = {}) {
    super(getMaxChunkSize(opts), blob.size);
    this.readBlob = typeof blob.arrayBuffer === "function" ? readBlobAsBuffer : readBlobFileReader;
  }

  private readonly readBlob: (blob: Blob) => Promise<ArrayBuffer>;

  protected async getPayload(i: number, offset: number, chunkSize: number): Promise<Uint8Array> {
    const sliced = this.blob.slice(offset, offset + chunkSize);
    const buffer = await this.readBlob(sliced);
    return new Uint8Array(buffer);
  }
}
