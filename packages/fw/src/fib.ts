import { Name } from "@ndn/packet";
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

  /** Count how many nexthops want to advertise the name. */
  public get nAdvertiseFrom() {
    let n = 0;
    this.nexthops.forEach((nh) => nh.attributes.advertiseFrom && ++n);
    return n;
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
    }
    entry.nexthops.add(nexthop);
    if (entry.nAdvertiseFrom > 0) {
      this.fw.advertisePrefix(entry);
    }
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
    if (entry.nAdvertiseFrom === 0) {
      this.fw.withdrawPrefix(entry);
    }
    if (entry.nexthops.size === 0) {
      this.table.delete(nameStr);
    }
  }
}
