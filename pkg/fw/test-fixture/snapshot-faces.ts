import { expect } from "vitest";

import { Forwarder, type FwFace } from "..";

/** Take a snapshot of faces in a logical forwarder. */
export class SnapshotFaces {
  constructor(private readonly fw = Forwarder.getDefault()) {
    this.snapshotFaces = new Set<FwFace>(fw.faces);
  }

  private readonly snapshotFaces: Set<FwFace>;

  /** List faces added since taking the snapshot. */
  public listNewFaces(): ReadonlySet<FwFace> {
    return this.fw.faces.difference(this.snapshotFaces);
  }

  /** List faces removed since taking the snapshot. */
  public listClosedFaces(): ReadonlySet<FwFace> {
    return this.snapshotFaces.difference(this.fw.faces);
  }

  /** Asserts that no faces were added. */
  public expectNoNewFace(): void {
    this.expectNoFace(this.listNewFaces(), "new");
  }

  /** Asserts that no faces were removed. */
  public expectNoClosedFace(): void {
    this.expectNoFace(this.listClosedFaces(), "closed");
  }

  private expectNoFace(set: ReadonlySet<FwFace>, desc: string): void {
    if (set.size === 0) {
      return;
    }
    expect.fail(`unexpected ${desc} faces: ${Array.from(set, (face) => face.toString()).join(",")}`);
  }

  /** Asserts that no faces were added or removed. */
  public expectSameFaces(): void {
    this.expectNoNewFace();
    this.expectNoClosedFace();
  }
}
