import { KeyMap, KeyMultiMap, KeyMultiSet } from "@ndn/util";

import type { Name } from "./name";

function keyOf(nameOrHex: Name | string): string {
  return typeof nameOrHex === "string" ? nameOrHex : nameOrHex.valueHex;
}

/**
 * Map keyed by name.
 * Lookups may accept either name or name.valueHex.
 */
export class NameMap<V> extends KeyMap<Name, V, string, string> {
  constructor() {
    super(keyOf);
  }
}

/**
 * MultiMap keyed by name.
 * Lookups may accept either name or name.valueHex.
 */
export class NameMultiMap<V> extends KeyMultiMap<Name, V, string, string> {
  constructor() {
    super(keyOf);
  }
}

/**
 * MultiSet keyed by name.
 * Lookups may accept either name or name.valueHex.
 */
export class NameMultiSet extends KeyMultiSet<Name, string, string> {
  constructor() {
    super(keyOf);
  }
}
