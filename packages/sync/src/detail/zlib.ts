import pako from "pako";

import type { Compression } from "./iblt-codec";

export function makeZlib(level: pako.DeflateFunctionOptions["level"]): Compression {
  return {
    compress(input) {
      return pako.deflate(input, { level });
    },
    decompress(compressed) {
      return pako.inflate(compressed);
    },
  };
}
