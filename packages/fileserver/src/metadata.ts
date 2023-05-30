import { Segment } from "@ndn/naming-convention2";
import { Component, TT as l3TT } from "@ndn/packet";
import { Metadata } from "@ndn/rdr";
import { Extensible, Extension, ExtensionRegistry, NNI } from "@ndn/tlv";

import { ModeDir, ModeReg, TT } from "./an";

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

  public get finalBlock(): Component | undefined {
    return Extension.get(this, l3TT.FinalBlock) as Component | undefined;
  }

  public set finalBlock(v) {
    if (v === undefined) {
      Extension.clear(this, l3TT.FinalBlock);
    } else {
      Extension.set(this, l3TT.FinalBlock, v);
    }
  }

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

  public get segmentSize(): number | undefined {
    return Extension.get(this, TT.SegmentSize) as number | undefined;
  }

  public set segmentSize(v) {
    if (v === undefined) {
      Extension.clear(this, TT.SegmentSize);
    } else {
      Extension.set(this, TT.SegmentSize, v);
    }
  }

  public get size(): number | undefined {
    return Extension.get(this, TT.Size) as number | undefined;
  }

  public set size(v) {
    if (v === undefined) {
      Extension.clear(this, TT.Size);
    } else {
      Extension.set(this, TT.Size, v);
    }
  }

  public get mode(): number {
    return (Extension.get(this, TT.Mode) as number | undefined) ?? 0;
  }

  public set mode(v) {
    Extension.set(this, TT.Mode, v);
  }

  public get isFile(): boolean {
    return (this.mode & ModeReg) !== 0;
  }

  public get isDir(): boolean {
    return (this.mode & ModeDir) !== 0;
  }

  public get atime(): Date | undefined {
    return Extension.get(this, TT.Atime) as Date | undefined;
  }

  public set atime(v) {
    if (v === undefined) {
      Extension.clear(this, TT.Atime);
    } else {
      Extension.set(this, TT.Atime, v);
    }
  }

  public get btime(): Date | undefined {
    return Extension.get(this, TT.Btime) as Date | undefined;
  }

  public set btime(v) {
    if (v === undefined) {
      Extension.clear(this, TT.Btime);
    } else {
      Extension.set(this, TT.Btime, v);
    }
  }

  public get ctime(): Date | undefined {
    return Extension.get(this, TT.Ctime) as Date | undefined;
  }

  public set ctime(v) {
    if (v === undefined) {
      Extension.clear(this, TT.Ctime);
    } else {
      Extension.set(this, TT.Ctime, v);
    }
  }

  public get mtime(): Date {
    return (Extension.get(this, TT.Mtime) as Date | undefined) ?? new Date();
  }

  public set mtime(v) {
    Extension.set(this, TT.Mtime, v);
  }
}
