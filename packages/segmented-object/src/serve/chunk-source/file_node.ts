import { promises as fs } from "graceful-fs";
import PLazy from "p-lazy";

import { Chunk, ChunkOptions, ChunkSource, getMaxChunkSize, KnownSizeChunkSource } from "./common";

class FileHandleChunkSource extends KnownSizeChunkSource {
  constructor(private readonly fh: fs.FileHandle, chunkSize: number, totalSize: number) {
    super(chunkSize, totalSize);
  }

  protected async getPayload(i: number, offset: number, chunkSize: number): Promise<Uint8Array> {
    void i;
    const payload = new Uint8Array(chunkSize);
    await this.fh.read(payload, 0, chunkSize, offset);
    return payload;
  }

  public async close() {
    await this.fh.close();
  }
}

/**
 * Generate chunks from a file.
 *
 * Warning: modifying the file while FileChunkSource is active may cause undefined behavior.
 */
export class FileChunkSource implements ChunkSource {
  constructor(path: string, opts: ChunkOptions = {}) {
    const chunkSize = getMaxChunkSize(opts);
    this.opening = PLazy.from(async () => {
      const fh = await fs.open(path, "r");
      const { size } = await fh.stat();
      return new FileHandleChunkSource(fh, chunkSize, size);
    });
  }

  private readonly opening: PLazy<FileHandleChunkSource>;

  /* istanbul ignore next: not used when getChunk is present */
  public async *listChunks(): AsyncIterable<Chunk> {
    const h = await this.opening;
    yield* h.listChunks();
  }

  public async getChunk(i: number): Promise<Chunk | undefined> {
    const h = await this.opening;
    return h.getChunk(i);
  }

  public async close() {
    const h = await this.opening;
    await h.close();
  }
}
