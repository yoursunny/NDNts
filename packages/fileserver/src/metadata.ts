import { Segment } from "@ndn/naming-convention2";
import { Component, TT as l3TT } from "@ndn/packet";
import { Metadata } from "@ndn/rdr";
import { Extensible, Extension, ExtensionRegistry, NNI } from "@ndn/tlv";

import { ModeDir, ModeFile, TT } from "./an";

const EXTENSIONS = new ExtensionRegistry();
EXTENSIONS.registerExtension<Component>({
  tt: l3TT.FinalBlock,
  decode(obj, { vd }) {
    void obj;
    return vd.decode(Component);
  },
  encode(obj, value) {
    void obj;
    return [l3TT.FinalBlock, value];
  },
});
for (const tt of [TT.SegmentSize, TT.Size, TT.Mode]) {
  EXTENSIONS.registerExtension<number>({
    tt,
    decode(obj, { nni }) {
      void obj;
      return nni;
    },
    encode(obj, value) {
      void obj;
      return [tt, NNI(value)];
    },
  });
}
for (const tt of [TT.Atime, TT.Btime, TT.Ctime, TT.Mtime]) {
  EXTENSIONS.registerExtension<Date>({
    tt,
    decode(obj, { nniBig }) {
      void obj;
      return new Date(Number(nniBig / 1000000n));
    },
    encode(obj, value) {
      void obj;
      return [tt, NNI(BigInt(value.getTime()) * 1000000n)];
    },
  });
}

/** ndn6-file-server metadata. */
@Metadata.extend
export class FileMetadata extends Metadata implements Extensible {
  public readonly [Extensible.TAG] = EXTENSIONS;
  public declare finalBlock: Component | undefined;
  public declare segmentSize: number | undefined;
  public declare size: number | undefined;
  public declare atime: Date | undefined;
  public declare btime: Date | undefined;
  public declare ctime: Date | undefined;

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
    return (Extension.get(this, TT.Mtime) as Date | undefined) ?? new Date();
  }

  public set mtime(v) {
    Extension.set(this, TT.Mtime, v);
  }
}
Extensible.defineGettersSetters(FileMetadata, {
  finalBlock: l3TT.FinalBlock,
  segmentSize: TT.SegmentSize,
  size: TT.Size,
  mode: TT.Mode,
  atime: TT.Atime,
  btime: TT.Btime,
  ctime: TT.Ctime,
});
