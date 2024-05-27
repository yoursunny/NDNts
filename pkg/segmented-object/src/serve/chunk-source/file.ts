import type { FileHandle } from "node:fs/promises";

import PLazy from "p-lazy";

import { type Chunk, type ChunkOptions, type ChunkSource, getMaxChunkSize, KnownSizeChunkSource } from "./common";
import { fsOpen } from "./platform_node";

class FileHandleChunkSource extends KnownSizeChunkSource {
  constructor(private readonly fh: FileHandle, chunkSize: number, totalSize: number) {
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
 * @remarks
 * Warning: modifying the file while FileChunkSource is active may cause undefined behavior.
 */
export class FileChunkSource implements ChunkSource {
  constructor(path: string, opts: FileChunkSource.Options = {}) {
    const chunkSize = getMaxChunkSize(opts);
    this.opening = PLazy.from(async () => {
      const fh = await fsOpen(path, opts);
      const { size } = await fh.stat();
      return new FileHandleChunkSource(fh, chunkSize, size);
    });
  }

  private readonly opening: PLazy<FileHandleChunkSource>;

  /* c8 ignore start: not used when getChunk is present */
  public async *listChunks(): AsyncIterable<Chunk> {
    const h = await this.opening;
    yield* h.listChunks();
  }
  /* c8 ignore stop */

  public async getChunk(i: number): Promise<Chunk | undefined> {
    const h = await this.opening;
    return h.getChunk(i);
  }

  public async close() {
    const h = await this.opening;
    await h.close();
  }
}
export namespace FileChunkSource {
  /** {@link FileChunkSource} options. */
  export type Options = ChunkOptions & {
    /**
     * Whether to use ZenFS.
     *
     * @remarks
     * - Set `true` to use ZenFS, which is a cross-platform virtual filesystem independent from
     *   the underlying operating system. This is the default in browser environment.
     * - Set `false` to use Node.js native filesystem. This is the default in Node.js.
     */
    zenfs?: boolean;
  };
}
