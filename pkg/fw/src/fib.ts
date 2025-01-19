import { lpm, type Name } from "@ndn/packet";
import { assert, getOrInsert } from "@ndn/util";

import type { FaceImpl } from "./face";

class FibEntry {
  public readonly nexthops = new Map<FaceImpl, boolean>(); // face=>capture
}

export class Fib {
  private readonly table = new Map<string, FibEntry>();

  public insert(face: FaceImpl, nameHex: string, capture: boolean): void {
    const entry = getOrInsert(this.table, nameHex, () => new FibEntry());
    assert(!entry.nexthops.has(face));
    entry.nexthops.set(face, capture);
  }

  public delete(face: FaceImpl, nameHex: string): void {
    const entry = this.table.get(nameHex)!;
    assert(!!entry);
    entry.nexthops.delete(face);
    if (entry.nexthops.size === 0) {
      this.table.delete(nameHex);
    }
  }

  public lookup(name: Name): ReadonlySet<FaceImpl> {
    const result = new Set<FaceImpl>();
    for (const entry of lpm(name, (prefixHex) => this.table.get(prefixHex))) {
      let capture = false;
      for (const [nh, c] of entry.nexthops) {
        result.add(nh);
        capture ||= c;
      }
      if (capture) {
        break;
      }
    }
    return result;
  }
}
