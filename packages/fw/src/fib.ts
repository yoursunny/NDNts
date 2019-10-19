import { Name } from "@ndn/name";
import { toHex } from "@ndn/tlv";
import assert from "minimalistic-assert";

import { FaceImpl } from "./face";
import { ForwarderImpl } from "./forwarder";

function nameToString(name: Name, prefixLen: number): string {
  return name.comps
         .map(({ type, value }, i) => i >= prefixLen ? "" : `/${type}=${toHex(value)}`)
         .join("");
}

export class FibEntry {
  public readonly nexthops = new Set<FaceImpl>();
  public readonly advertisedTo = new WeakMap<FaceImpl, any>();

  constructor(public readonly name: Name) {
  }
}

export class Fib {
  public readonly table = new Map<string, FibEntry>();

  constructor(private readonly fw: ForwarderImpl) {
  }

  public insert(name: Name, nexthop: FaceImpl): void {
    const nameStr = nameToString(name, name.length);
    if (nexthop.routes.has(nameStr)) {
      return;
    }
    nexthop.routes.add(nameStr);

    let entry = this.table.get(nameStr);
    if (!entry) {
      entry = new FibEntry(name);
      this.table.set(nameStr, entry);
      this.fw.advertisePrefix(entry);
    }
    entry.nexthops.add(nexthop);
  }

  public delete(name: Name, nexthop: FaceImpl): void {
    const nameStr = nameToString(name, name.length);
    if (!nexthop.routes.has(nameStr)) {
      return;
    }
    nexthop.routes.delete(nameStr);
    this.deleteImpl(nameStr, nexthop);
  }

  public lpm(name: Name): FibEntry|undefined {
    for (let prefixLen = name.length; prefixLen >= 0; --prefixLen) {
      const prefixStr = nameToString(name, prefixLen);
      const entry = this.table.get(prefixStr);
      if (entry) {
        assert(entry.nexthops.size > 0);
        return entry;
      }
    }
    return undefined;
  }

  public closeFace(face: FaceImpl) {
    for (const nameStr of face.routes) {
      this.deleteImpl(nameStr, face);
    }
    face.routes.clear();
  }

  private deleteImpl(nameStr: string, nexthop: FaceImpl) {
    const entry = this.table.get(nameStr)!;
    assert(!!entry);
    entry.nexthops.delete(nexthop);
    if (entry.nexthops.size === 0) {
      this.table.delete(nameStr);
      this.fw.withdrawPrefix(entry);
    }
  }
}
