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

type NumberConvention = NamingConvention<number> & NamingConvention.WithAltUri;
class TypedNumber extends Typed implements NumberConvention {
  private readonly altUriRegex: RegExp;

  constructor(tt: number, private readonly altUriPrefix: string) {
    super(tt);
    this.altUriRegex = new RegExp(`^${altUriPrefix}=(\\d+)$`);
  }

  public create(v: number): Component {
    return new Component(this.tt, Encoder.encode(NNI(v), 8));
  }

  public match(comp: Component): boolean {
    return super.match(comp) && NNI.isValidLength(comp.length);
  }

  public parse(comp: Component): number {
    return NNI.decode(comp.value);
  }

  public toAltUri(comp: Component): string {
    return `${this.altUriPrefix}=${this.parse(comp)}`;
  }

  public fromAltUri(input: string): Component|undefined {
    const m = this.altUriRegex.exec(input);
    if (!m) {
      return undefined;
    }
    const v = Number.parseInt(m[1]!, 10);
    return this.create(v); // throws upon !Number.isSafeInteger(v)
  }
}

const timestampNumber = new TypedNumber(0x24, "t");

type TimestampConvention = NamingConvention<number|Date, number> & NamingConvention.WithAltUri;
class TypedTimestamp extends Typed implements TimestampConvention {
  constructor(
      private readonly unit: number,
      private readonly max = Number.MAX_SAFE_INTEGER,
  ) {
    super(0x24);
  }

  public create(v: number|Date): Component {
    if (typeof v === "number") {
      v *= this.unit;
    } else {
      v = v.getTime() * 1000;
    }
    return timestampNumber.create(v);
  }

  public match(comp: Component): boolean {
    return timestampNumber.match(comp);
  }

  public parse(comp: Component): number {
    const v = timestampNumber.parse(comp);
    if (v > this.max) {
      throw new Error("timestamp number too large");
    }
    return v / this.unit;
  }

  public toAltUri(comp: Component): string {
    return timestampNumber.toAltUri(comp);
  }

  public fromAltUri(input: string): Component|undefined {
    return timestampNumber.fromAltUri(input);
  }
}

/** KeywordNameComponent, interpreted as string. */
export const Keyword: NamingConvention<string> = new TypedString(0x20);

/** SegmentNameComponent, interpreted as number. */
export const Segment: NumberConvention = new TypedNumber(0x21, "seg");

/** ByteOffsetNameComponent, interpreted as number. */
export const ByteOffset: NumberConvention = new TypedNumber(0x22, "off");

/** VersionNameComponent, interpreted as number. */
export const Version: NumberConvention = new TypedNumber(0x23, "v");

// Beyond 8787511468039992, v/1000 may lose precision.
const timestampMs = new TypedTimestamp(1000, 8787511468039992) as TimestampConvention;

/** TimestampNameComponent, interpreted as number in milliseconds. */
export const Timestamp = Object.assign(
  timestampMs,
  {
    /** TimestampNameComponent, interpreted as number in milliseconds. */
    ms: timestampMs,
    /** TimestampNameComponent, interpreted as number in microseconds. */
    us: new TypedTimestamp(1) as TimestampConvention,
  });

/** SequenceNumNameComponent, interpreted as number. */
export const SequenceNum: NumberConvention = new TypedNumber(0x25, "seq");
