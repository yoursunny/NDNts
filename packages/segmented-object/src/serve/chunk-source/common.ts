import type { AnyIterable } from "streaming-iterables";

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
   * @returns an Iterable or AsyncIterable of chunks in order.
   */
  listChunks(): AnyIterable<Chunk>;

  /**
   * Generate a chunk on-demand.
   * @param i chunk number, starting from zero.
   * @returns a Promise that resolves to requested chunk, or undefined if out of range.
   */
  getChunk?: (i: number) => Promise<Chunk|undefined>;
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
