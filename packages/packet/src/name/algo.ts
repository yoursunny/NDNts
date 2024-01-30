import { toHex } from "@ndn/util";

import type { Name } from "./name";

/**
 * Perform name longest prefix match on a container of entries.
 * @typeParam T - Entry type, which must not be `undefined`.
 * @param name - Lookup target name.
 * @param get - Callback function to retrieve entry by name prefix TLV-VALUE in hexadecimal format.
 * @returns Matched entries.
 * The first result is the longest prefix match. Subsequent results are matches on successively
 * shorter prefixes. The caller may early-return the iterator to ignore subsequent results.
 */
export function* lpm<T>(name: Name, get: (prefixHex: string) => T | undefined): Iterable<T> {
  const prefixes = [""];
  let s = "";
  for (const comp of name.comps) {
    s += toHex(comp.tlv);
    prefixes.push(s);
  }

  let prefix: string | undefined;
  while ((prefix = prefixes.pop()) !== undefined) {
    const entry = get(prefix);
    if (entry !== undefined) {
      yield entry;
    }
  }
}
