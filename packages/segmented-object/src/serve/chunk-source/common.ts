/** Index and payload of a chunk. */
export interface Chunk {
  /** Chunk number, starting from zero. */
  i: number;

  /** Final chunk number, if known. */
  final?: number;

  /** Chunk payload. */
  payload: Uint8Array;
}

/** An object that can generate chunks. */
export interface ChunkSource {
  /**
   * Generate chunks sequentially.
   * @returns an AsyncIterable of chunks in order.
   */
  listChunks: () => AsyncIterable<Chunk>;

  /**
   * Generate a chunk on-demand.
   * @param i chunk number, starting from zero.
   * @returns a Promise that resolves to requested chunk, or undefined if out of range.
   */
  getChunk?: (i: number) => Promise<Chunk|undefined>;

  close?: () => void;
}

export abstract class KnownSizeChunkSource implements ChunkSource {
  constructor(
      protected readonly chunkSize: number,
      protected readonly totalSize: number,
  ) {
    this.finalChunkSize = totalSize % chunkSize;
    this.final = (totalSize - this.finalChunkSize) / chunkSize;
    if (this.finalChunkSize === 0 && totalSize > 0) {
      this.finalChunkSize = chunkSize;
      this.final -= 1;
    }
  }

  protected readonly final: number;
  protected readonly finalChunkSize: number;

  /* istanbul ignore next: not used when getChunk is present */
  public async *listChunks(): AsyncIterable<Chunk> {
    for (let i = 0; i <= this.final; ++i) {
      yield this.makeChunk(i);
    }
  }

  public async getChunk(i: number): Promise<Chunk|undefined> {
    if (i > this.final) {
      return undefined;
    }
    return this.makeChunk(i);
  }

  private async makeChunk(i: number): Promise<Chunk> {
    const payload = await this.getPayload(i, i * this.chunkSize,
      i === this.final ? this.finalChunkSize : this.chunkSize);
    return {
      i,
      final: this.final,
      payload,
    };
  }

  protected abstract getPayload(i: number, offset: number, chunkSize: number): Promise<Uint8Array>;
}

interface ChunkSizeRange {
  /**
   * Minimum chunk size.
   * @default 64
   */
  minChunkSize?: number;

  /**
   * Maximum chunk size.
   * @default 4096
   */
  maxChunkSize?: number;
}

interface ChunkSizeExact {
  /** Exact chunk size. */
  chunkSize?: number;
}

export type ChunkOptions = ChunkSizeRange | ChunkSizeExact;

export function getMinChunkSize(opts: ChunkOptions): number {
  return (opts as ChunkSizeRange).minChunkSize ?? (opts as ChunkSizeExact).chunkSize ?? 64;
}

export function getMaxChunkSize(opts: ChunkOptions): number {
  return (opts as ChunkSizeRange).maxChunkSize ?? (opts as ChunkSizeExact).chunkSize ?? 4096;
}
