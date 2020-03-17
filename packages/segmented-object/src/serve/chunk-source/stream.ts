import { fromStream } from "streaming-iterables";

import type { ChunkOptions, ChunkSource } from "./common";
import { IterableChunkSource } from "./iterable";

/**
 * Generate chunks from a readable stream.
 * This implementation generates all chunks as they arrive and ignores requests.
 */
export class StreamChunkSource extends IterableChunkSource implements ChunkSource {
  constructor(stream: NodeJS.ReadableStream, opts: ChunkOptions = {}) {
    super(fromStream(stream), opts);
  }
}
