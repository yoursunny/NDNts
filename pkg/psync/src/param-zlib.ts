import { concatBuffers } from "@ndn/util";
import { collect } from "streaming-iterables";

import type { PSyncCodec } from "./codec";

/** Use zlib compression with PSync. */
export const PSyncZlib: PSyncCodec.Compression = {
  async compress(input) {
    return doTransform(input, new CompressionStream("deflate"));
  },
  async decompress(compressed) {
    return doTransform(compressed, new DecompressionStream("deflate"));
  },
};

async function doTransform(input: Uint8Array, tr: TransformStream<Uint8Array, Uint8Array>): Promise<Uint8Array> {
  const chunks = await collect(
    new Blob([input]).stream()
      .pipeThrough(tr) as unknown as AsyncIterable<Uint8Array>,
  );
  return concatBuffers(chunks);
}
