import { Forwarder, FwFace } from "@ndn/fw";
import { Name } from "@ndn/packet";
import DefaultWeakMap from "mnemonist/default-weak-map.js";

const emptyName = new Name();

/**
 * Helper to automatically add sync group prefix as a route on uplinks.
 *
 * In most synchronization protocols, all participants register the sync group prefix and also send
 * Interests under the same prefix. Due to the FIB longest prefix match logic in `@ndn/fw` package,
 * sync Interests would match the local participant's own route registration, and would not match the
 * `/` default route on uplink faces.
 *
 * This helper automatically registers sync group prefix on current and future uplink faces in a
 * logical forwarder. A face is considered an uplink if it has a `/` route.
 */
export class UplinkRouteMirror {
  constructor(private readonly fw: Forwarder, private readonly prefix: Name) {
    this.added = new DefaultWeakMap<FwFace, undefined>((face) => {
      face.addRoute(this.prefix, false);
      return undefined;
    });

    for (const face of this.fw.faces) {
      if (face.hasRoute(emptyName)) {
        this.added.get(face);
      }
    }
    this.fw.on("prefixadd", this.handlePrefixAdd);
    this.fw.on("prefixrm", this.handlePrefixRm);
  }

  private readonly added: DefaultWeakMap<FwFace, undefined>;

  public close(): void {
    this.fw.off("prefixadd", this.handlePrefixAdd);
    this.fw.off("prefixrm", this.handlePrefixRm);
    for (const face of this.fw.faces) {
      if (this.added.has(face)) {
        face.removeRoute(this.prefix, false);
      }
    }
  }

  private handlePrefixAdd = (face: FwFace, prefix: Name): void => {
    if (prefix.length === 0) {
      this.added.get(face);
    }
  };

  private handlePrefixRm = (face: FwFace, prefix: Name): void => {
    if (prefix.length === 0 && !face.hasRoute(emptyName) && this.added.delete(face)) {
      face.removeRoute(this.prefix, false);
    }
  };
}
