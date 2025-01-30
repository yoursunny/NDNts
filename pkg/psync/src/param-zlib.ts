import { deflate, inflate } from "pako";

import type { PSyncCodec } from "./codec";

/** Use zlib compression with PSync. */
export const PSyncZlib: PSyncCodec.Compression = {
  compress(input) {
    return deflate(input, { level: 9 });
  },
  decompress(compressed) {
    return inflate(compressed);
  },
};
