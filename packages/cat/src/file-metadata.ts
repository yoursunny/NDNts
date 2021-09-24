import { Segment } from "@ndn/naming-convention2";
import { Component, TT } from "@ndn/packet";
import { Metadata } from "@ndn/rdr";
import { Extensible, Extension, ExtensionRegistry, NNI } from "@ndn/tlv";

const TtSegmentSize = 0xF500;
const TtSize = 0xF502;
const TtMode = 0xF504;
const TtAtime = 0xF506;
const TtBtime = 0xF508;
const TtCtime = 0xF50A;
const TtMtime = 0xF50C;

const EXTENSIONS = new ExtensionRegistry();
EXTENSIONS.registerExtension<Component>({
  tt: TT.FinalBlock,
  decode(obj, { vd }) {
    void obj;
    return vd.decode(Component);
  },
  encode(obj, value) {
    void obj;
    return [TT.FinalBlock, value];
  },
});
for (const tt of [TtSegmentSize, TtSize, TtMode]) {
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
for (const tt of [TtAtime, TtBtime, TtCtime, TtMtime]) {
  EXTENSIONS.registerExtension<Date>({
    tt,
    decode(obj, { nniBig }) {
      void obj;
      return new Date(Number(nniBig / 1000000n));
    },
    encode(obj, value) {
      void obj;
      return [tt, NNI(BigInt(value.getTime()) * 100000n)];
    },
  });
}

/**
 * ndn6-file-server metadata.
 * https://github.com/yoursunny/ndn6-tools/blob/main/file-server.md
 */
@Metadata.extend
export class FileMetadata extends Metadata implements Extensible {
  public readonly [Extensible.TAG] = EXTENSIONS;

  public get finalBlock(): Component | undefined {
    return Extension.get(this, TT.FinalBlock) as Component | undefined;
  }

  public get lastSeg(): number | undefined {
    const { finalBlock } = this;
    if (!finalBlock?.is(Segment)) {
      return undefined;
    }
    return finalBlock.as(Segment);
  }

  public get segmentSize(): number | undefined {
    return Extension.get(this, TtSegmentSize) as number | undefined;
  }

  public get size(): number | undefined {
    return Extension.get(this, TtSize) as number | undefined;
  }

  public get mode(): number {
    return (Extension.get(this, TtMode) as number | undefined) ?? 0;
  }

  public get isFile(): boolean {
    const { mode = 0 } = this;
    return (mode & 0x8000) !== 0;
  }

  public get isDir(): boolean {
    const { mode = 0 } = this;
    return (mode & 0x4000) !== 0;
  }

  public get atime(): Date | undefined {
    return Extension.get(this, TtAtime) as Date | undefined;
  }

  public get btime(): Date | undefined {
    return Extension.get(this, TtBtime) as Date | undefined;
  }

  public get ctime(): Date | undefined {
    return Extension.get(this, TtCtime) as Date | undefined;
  }

  public get mtime(): Date {
    return (Extension.get(this, TtMtime) as Date | undefined) ?? new Date();
  }
}
