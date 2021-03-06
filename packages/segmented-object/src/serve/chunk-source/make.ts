import { readable as isReadableStream } from "is-stream";
import type { AnyIterable } from "streaming-iterables";

import { BufferChunkSource } from "./buffer";
import type { ChunkOptions } from "./common";
import { IterableChunkSource } from "./iterable";
import { StreamChunkSource } from "./stream";

export function makeChunkSource(input: Uint8Array, opts?: ChunkOptions): BufferChunkSource;

export function makeChunkSource(input: AnyIterable<Uint8Array>, opts?: ChunkOptions): IterableChunkSource;

export function makeChunkSource(input: NodeJS.ReadableStream, opts?: ChunkOptions): StreamChunkSource;

/**
 * Create a chunk source, auto detecting input type.
 *
 * Use of this function is discouraged as it pulls in ChunkSource implementations not needed by
 * your application. It's recommended to construct a ChunkSource implementation directly.
 */
export function makeChunkSource(input: Uint8Array | AnyIterable<Uint8Array> | NodeJS.ReadableStream, opts: ChunkOptions = {}) {
  if (input instanceof Uint8Array) {
    return new BufferChunkSource(input, opts);
  }
  if ((isReadableStream as (obj: unknown) => obj is NodeJS.ReadableStream)(input)) {
    return new StreamChunkSource(input, opts);
  }
  return new IterableChunkSource(input, opts);
}
