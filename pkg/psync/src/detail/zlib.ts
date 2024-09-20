import { deflate, inflate } from "pako";

import type { Compression } from "./iblt-codec";

export function makeZlib(level: pako.DeflateFunctionOptions["level"]): Compression {
  return {
    compress(input) {
      return deflate(input, { level });
    },
    decompress(compressed) {
      return inflate(compressed);
    },
  };
}
