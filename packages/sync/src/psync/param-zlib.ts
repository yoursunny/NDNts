import pako from "pako";

import type { PSyncCodec } from "./codec";

/** Use zlib compression with PSync. */
export const PSyncZlib: PSyncCodec.Compression = {
  compress(input) {
    return pako.deflate(input, { level: 9 });
  },
  decompress(compressed) {
    return pako.inflate(compressed);
  },
};
