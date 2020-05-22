import type { Name } from "@ndn/packet";

import type { PrefixRegController } from "./types";

/** Register a fixed set of prefixes. */
export function PrefixRegStatic(...prefixes: Name[]): PrefixRegController {
  return (store, face) => {
    for (const prefix of prefixes) {
      face.addRoute(prefix);
    }
    return { close: () => undefined };
  };
}
