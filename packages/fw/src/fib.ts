import { Name } from "@ndn/packet";
import { toHex } from "@ndn/tlv";
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
    const prefixHexs = [""];
    let s = "";
    for (let i = 0; i < name.length; ++i) {
      s += toHex(name.get(i)!.tlv);
      prefixHexs.push(s);
    }

    for (let prefixLen = name.length; prefixLen >= 0; --prefixLen) {
      const prefixStr = prefixHexs.pop()!;
      const entry = this.table.peek(prefixStr);
      if (entry) {
        assert(entry.nexthops.size > 0);
        return entry;
      }
    }
    return undefined;
  }
}
