// eslint-disable-next-line n/no-unsupported-features/node-builtins
import type { Blob as NodeBlob } from "node:buffer";

import type { AnyIterable } from "streaming-iterables";

import { BlobChunkSource } from "./blob";
import { BufferChunkSource } from "./buffer";
import type { ChunkOptions } from "./common";
import { IterableChunkSource } from "./iterable";

/**
 * Create a {@link BufferChunkSource}.
 * @deprecated Use of this function is discouraged because it pulls in `ChunkSource` subclasses
 * not needed by your application. Instead, construct {@link BufferChunkSource} directly.
 */
export function makeChunkSource(input: Uint8Array, opts?: ChunkOptions): BufferChunkSource;

/**
 * Create a {@link BlobChunkSource}.
 * @deprecated Use of this function is discouraged because it pulls in `ChunkSource` subclasses
 * not needed by your application. Instead, construct {@link BlobChunkSource} directly.
 */
export function makeChunkSource(input: Blob | NodeBlob, opts?: ChunkOptions): BlobChunkSource;

/**
 * Create a {@link IterableChunkSource}.
 * @deprecated Use of this function is discouraged because it pulls in `ChunkSource` subclasses
 * not needed by your application. Instead, construct {@link IterableChunkSource} directly.
 */
export function makeChunkSource(input: AnyIterable<Uint8Array> | NodeJS.ReadableStream, opts?: ChunkOptions): IterableChunkSource;

export function makeChunkSource(input: Uint8Array | Blob | NodeBlob | AnyIterable<Uint8Array> | NodeJS.ReadableStream, opts?: ChunkOptions) {
  if (input instanceof Uint8Array) {
    return new BufferChunkSource(input, opts);
  }
  if (isBlob(input)) {
    return new BlobChunkSource(input, opts);
  }
  return new IterableChunkSource(input, opts);
}

function isBlob(obj: any): obj is Blob | NodeBlob {
  return typeof obj === "object" &&
    typeof (obj as Blob).size === "number" &&
    typeof (obj as Blob).arrayBuffer === "function" &&
    typeof (obj as Blob).slice === "function";
}
