import { Segment } from "@ndn/naming-convention2";
import { type Component, StructFieldComponentNested, TT as l3TT } from "@ndn/packet";
import { Metadata } from "@ndn/rdr";
import { Extensible, Extension, ExtensionRegistry, StructFieldNNI, StructFieldNNIBig } from "@ndn/tlv";

import { ModeDir, ModeFile, TT } from "./an";

const EXTENSIONS = new ExtensionRegistry();
EXTENSIONS.register(l3TT.FinalBlock, StructFieldComponentNested);
for (const tt of [TT.SegmentSize, TT.Size, TT.Mode]) {
  EXTENSIONS.register(tt, StructFieldNNI);
}
for (const tt of [TT.Atime, TT.Btime, TT.Ctime, TT.Mtime]) {
  EXTENSIONS.register(tt, StructFieldNNIBig);
}

/** ndn6-file-server file/directory metadata. */
@Metadata.extend
export class FileMetadata extends Metadata implements Extensible {
  public readonly [Extensible.TAG] = EXTENSIONS;
  public declare finalBlock: Component | undefined;
  public declare segmentSize: number | undefined;
  public declare size: number | undefined;
  private declare atimeBig: bigint | undefined;
  private declare btimeBig: bigint | undefined;
  private declare ctimeBig: bigint | undefined;
  private declare mtimeOBig: bigint | undefined;
  public declare atime: Date | undefined;
  public declare btime: Date | undefined;
  public declare ctime: Date | undefined;
  private declare mtimeO: Date | undefined;

  public get lastSeg(): number | undefined {
    const { finalBlock } = this;
    if (!finalBlock?.is(Segment)) {
      return undefined;
    }
    return finalBlock.as(Segment);
  }

  public set lastSeg(v) {
    if (v === undefined) {
      this.finalBlock = undefined;
    } else {
      this.finalBlock = Segment.create(v);
    }
  }

  public get mode(): number {
    return (Extension.get(this, TT.Mode) as number | undefined) ?? 0;
  }

  public set mode(v) {
    Extension.set(this, TT.Mode, v);
  }

  public get isFile(): boolean {
    return (this.mode & ModeFile) !== 0;
  }

  public get isDir(): boolean {
    return (this.mode & ModeDir) !== 0;
  }

  public get mtime(): Date {
    return this.mtimeO ?? new Date();
  }

  public set mtime(v) {
    this.mtimeO = v;
  }
}
Extensible.defineGettersSetters(FileMetadata, {
  finalBlock: l3TT.FinalBlock,
  segmentSize: TT.SegmentSize,
  size: TT.Size,
  mode: TT.Mode,
  atimeBig: TT.Atime,
  btimeBig: TT.Btime,
  ctimeBig: TT.Ctime,
  mtimeOBig: TT.Mtime,
});
for (const key of ["atime", "btime", "ctime", "mtimeO"] as const) {
  Object.defineProperty(FileMetadata.prototype, key, {
    enumerable: true,
    get(this: FileMetadata) {
      const value = this[`${key}Big`];
      return value === undefined ? undefined : new Date(Number(value / 1000000n));
    },
    set(this: FileMetadata, value: Date | undefined) {
      this[`${key}Big`] = value === undefined ? undefined : BigInt(value.getTime()) * 1000000n;
    },
  });
}
