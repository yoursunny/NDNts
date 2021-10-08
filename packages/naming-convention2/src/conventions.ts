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
      private readonly unit: number,
      private readonly max = Number.MAX_SAFE_INTEGER,
  ) {
    super(0x24, "t");
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

/** KeywordNameComponent, interpreted as string. */
export const Keyword: NamingConvention<string> = new TypedString(0x20);

/** SegmentNameComponent, interpreted as number. */
export const Segment: NumberBigConvention = new TypedNumberBig(0x21, "seg");

/** ByteOffsetNameComponent, interpreted as number. */
export const ByteOffset: NumberBigConvention = new TypedNumberBig(0x22, "off");

/** VersionNameComponent, interpreted as number. */
export const Version: NumberBigConvention = new TypedNumberBig(0x23, "v");

const timestampMs: NumberConvention<Date> = new TypedTimestamp(1000, 8787511468039992);
const timestampUs: NumberConvention<Date> = new TypedTimestamp(1);

/** TimestampNameComponent, interpreted as number in milliseconds. */
export const Timestamp = Object.assign(
  timestampMs,
  {
    /** TimestampNameComponent, interpreted as number in milliseconds. */
    ms: timestampMs,
    /** TimestampNameComponent, interpreted as number in microseconds. */
    us: timestampUs,
  });

/** SequenceNumNameComponent, interpreted as number. */
export const SequenceNum: NumberBigConvention = new TypedNumberBig(0x25, "seq");
