import { Component, NamingConvention } from "@ndn/packet";
import { Encoder, NNI } from "@ndn/tlv";

abstract class Typed {
  constructor(protected readonly tt: number) {}

  public match(comp: Component): boolean {
    return comp.type === this.tt;
  }
}

class TypedString extends Typed implements NamingConvention<string> {
  public create(v: string): Component {
    return new Component(this.tt, v);
  }

  public parse(comp: Component): string {
    return comp.text;
  }
}

abstract class TypedNumberBase extends Typed {
  private readonly altUriRegex: RegExp;

  constructor(
      tt: number,
      private readonly altUriPrefix: string,
  ) {
    super(tt);
    this.altUriRegex = new RegExp(`^${altUriPrefix}=(\\d+)$`);
  }

  public create(v: number | bigint): Component {
    return new Component(this.tt, Encoder.encode(NNI(v), 8));
  }

  public override match(comp: Component): boolean {
    return super.match(comp) && NNI.isValidLength(comp.length);
  }

  protected parseRaw(comp: Component): bigint {
    return NNI.decode(comp.value, { big: true });
  }

  public toAltUri(comp: Component): string {
    return `${this.altUriPrefix}=${this.parseRaw(comp)}`;
  }

  public fromAltUri(input: string): Component | undefined {
    const m = this.altUriRegex.exec(input);
    if (!m) {
      return undefined;
    }
    return this.create(BigInt(m[1]!));
  }
}

interface NumberConvention<A = never, R extends number | bigint = number> extends NamingConvention<number | bigint | A, R>, NamingConvention.WithAltUri {}

class TypedNumber extends TypedNumberBase implements NumberConvention {
  public parse(comp: Component): number {
    return NNI.decode(comp.value);
  }
}

class TypedBig extends TypedNumberBase implements NumberConvention<never, bigint> {
  public parse(comp: Component): bigint {
    return NNI.decode(comp.value, { big: true });
  }
}

interface NumberBigConvention<A = never> extends NumberConvention<A> {
  big: NumberConvention<A, bigint>;
}

class TypedNumberBig extends TypedNumber implements NumberBigConvention {
  constructor(...args: ConstructorParameters<typeof TypedNumberBase>) {
    super(...args);
    this.big = new TypedBig(...args);
  }

  public readonly big: TypedBig;
}

class TypedTimestamp extends TypedNumber implements NumberConvention<Date> {
  constructor(
      tt: number,
      private readonly unit: number,
      private readonly max = Number.MAX_SAFE_INTEGER,
  ) {
    super(tt, "t");
  }

  public override create(v: number | bigint | Date): Component {
    if (v instanceof Date) {
      v = v.getTime() * 1000;
    } else {
      v = Number(v) * this.unit;
    }
    this.checkMax(v);
    return super.create(v);
  }

  public override parse(comp: Component): number {
    const v = super.parse(comp);
    this.checkMax(v);
    return v / this.unit;
  }

  private checkMax(v: number): void {
    if (v > this.max) {
      throw new Error("timestamp number too large");
    }
  }
}

interface TimestampConvention extends NumberConvention<Date> {
  /** Timestamp interpreted as number in milliseconds. */
  ms: NumberConvention<Date>;
  /** Timestamp interpreted as number in microseconds. */
  us: NumberConvention<Date>;
}

function makeTimestampConvention(tt: number): TimestampConvention {
  const ms = new TypedTimestamp(0x24, 1000, 8787511468039992);
  const us = new TypedTimestamp(0x24, 1);
  return Object.assign(ms, { ms, us });
}

/** KeywordNameComponent (rev2), interpreted as string. */
export const Keyword2: NamingConvention<string> = new TypedString(0x20);
/** KeywordNameComponent (rev3), interpreted as string. */
export const Keyword3: NamingConvention<string> = new TypedString(0x30);

/** SegmentNameComponent (rev2), interpreted as number. */
export const Segment2: NumberBigConvention = new TypedNumberBig(0x21, "seg");
/** SegmentNameComponent (rev3), interpreted as number. */
export const Segment3: NumberBigConvention = new TypedNumberBig(0x32, "seg");

/** ByteOffsetNameComponent (rev2), interpreted as number. */
export const ByteOffset2: NumberBigConvention = new TypedNumberBig(0x22, "off");
/** ByteOffsetNameComponent (rev3), interpreted as number. */
export const ByteOffset3: NumberBigConvention = new TypedNumberBig(0x34, "off");

/** VersionNameComponent (rev2), interpreted as number. */
export const Version2: NumberBigConvention = new TypedNumberBig(0x23, "v");
/** VersionNameComponent (rev3), interpreted as number. */
export const Version3: NumberBigConvention = new TypedNumberBig(0x36, "v");

/** TimestampNameComponent (rev2), interpreted as number in milliseconds. */
export const Timestamp2 = makeTimestampConvention(0x24);
/** TimestampNameComponent (rev3), interpreted as number in milliseconds. */
export const Timestamp3 = makeTimestampConvention(0x38);

/** SequenceNumNameComponent (rev2), interpreted as number. */
export const SequenceNum2: NumberBigConvention = new TypedNumberBig(0x25, "seq");
/** SequenceNumNameComponent (rev3), interpreted as number. */
export const SequenceNum3: NumberBigConvention = new TypedNumberBig(0x3A, "seq");

/** KeywordNameComponent (default format, currently rev2). */
export const Keyword = Keyword2;
/** SegmentNameComponent (default format, currently rev2). */
export const Segment = Segment2;
/** ByteOffsetNameComponent (default format, currently rev2). */
export const ByteOffset = ByteOffset2;
/** VersionNameComponent (default format, currently rev2). */
export const Version = Version2;
/** TimestampNameComponent (default format, currently rev2). */
export const Timestamp = Timestamp2;
/** SequenceNumNameComponent (default format, currently rev2). */
export const SequenceNum = SequenceNum2;
