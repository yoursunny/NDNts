import { KeyMap, KeyMultiMap, KeyMultiSet } from "@ndn/util";

import type { Name } from "./name";

function keyOf(name: Name): string {
  return name.valueHex;
}

export class NameMap<V> extends KeyMap<Name, V, string> {
  constructor() {
    super(keyOf);
  }
}

export class NameMultiMap<V> extends KeyMultiMap<Name, V, string> {
  constructor() {
    super(keyOf);
  }
}

export class NameMultiSet extends KeyMultiSet<Name, string> {
  constructor() {
    super(keyOf);
  }
}
