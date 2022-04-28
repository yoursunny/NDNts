import type { ChunkOptions, ChunkSource } from "./common";
import { IterableChunkSource } from "./iterable";

/**
 * Generate chunks from a readable stream.
 * This implementation generates all chunks as they arrive, regardless of whether they are requested.
 */
export class StreamChunkSource extends IterableChunkSource implements ChunkSource {
  constructor(stream: NodeJS.ReadableStream, opts: ChunkOptions = {}) {
    super(stream as AsyncIterable<Buffer>, opts);
  }
}
