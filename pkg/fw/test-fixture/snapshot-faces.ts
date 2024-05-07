import set_helpers from "mnemonist/set.js";
import { expect } from "vitest";

import { Forwarder, type FwFace } from "..";

/** Take a snapshot of faces in a logical forwarder. */
export class SnapshotFaces {
  constructor(private readonly fw = Forwarder.getDefault()) {
    this.snapshotFaces = new Set<FwFace>(fw.faces);
  }

  private readonly snapshotFaces: Set<FwFace>;

  /** List faces added since taking the snapshot. */
  public listNewFaces(): FwFace[] {
    return Array.from(set_helpers.difference(this.fw.faces as Set<FwFace>, this.snapshotFaces));
  }

  /** List faces removed since taking the snapshot. */
  public listClosedFaces(): FwFace[] {
    return Array.from(set_helpers.difference(this.snapshotFaces, this.fw.faces as Set<FwFace>));
  }

  /** Asserts that no faces were added. */
  public expectNoNewFace(): void {
    this.expectNoFace(this.listNewFaces(), "new");
  }

  /** Asserts that no faces were removed. */
  public expectNoClosedFace(): void {
    this.expectNoFace(this.listClosedFaces(), "closed");
  }

  private expectNoFace(list: readonly FwFace[], desc: string): void {
    if (list.length === 0) {
      return;
    }
    expect.fail(`unexpected ${desc} faces: ${Array.from(list, (face) => face.toString()).join(",")}`);
  }

  /** Asserts that no faces were added or removed. */
  public expectSameFaces(): void {
    this.expectNoNewFace();
    this.expectNoClosedFace();
  }
}
