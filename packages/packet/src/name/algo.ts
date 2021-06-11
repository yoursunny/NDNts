import { toHex } from "@ndn/tlv";

import type { Name } from "./name";

/**
 * Name longest prefix match algorithm.
 * @param name target name.
 * @param get callback function to retrieve entry by hexadecimal name prefix.
 */
export function* lpm<Entry>(name: Name, get: (prefixHex: string) => Entry | undefined): Iterable<Entry> {
  const prefixes = [""];
  let s = "";
  for (const comp of name.comps) {
    s += toHex(comp.tlv);
    prefixes.push(s);
  }

  while (prefixes.length > 0) {
    const prefix = prefixes.pop()!;
    const entry = get(prefix);
    if (entry) {
      yield entry;
    }
  }
}
