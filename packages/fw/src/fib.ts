import { lpm, Name } from "@ndn/packet";
import assert from "minimalistic-assert";
import DefaultMap from "mnemonist/default-map.js";

import type { FaceImpl } from "./face";

class FibEntry {
  public readonly nexthops = new Set<FaceImpl>();
}

export class Fib {
  public readonly table = new DefaultMap<string, FibEntry>(() => new FibEntry());

  public insert(face: FaceImpl, nameHex: string): void {
    const entry = this.table.get(nameHex);
    entry.nexthops.add(face);
  }

  public delete(face: FaceImpl, nameHex: string): void {
    const entry = this.table.peek(nameHex)!;
    assert(!!entry);
    entry.nexthops.delete(face);
    if (entry.nexthops.size === 0) {
      this.table.delete(nameHex);
    }
  }

  public lpm(name: Name): FibEntry|undefined {
    const entry = lpm(name, (prefixHex) => this.table.peek(prefixHex));
    if (entry) {
      assert(entry.nexthops.size > 0);
    }
    return entry;
  }
}
