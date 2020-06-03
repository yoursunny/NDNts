import { Component, NamingConvention } from "@ndn/packet";
import { Encoder, NNI } from "@ndn/tlv";

abstract class Typed {
  constructor(protected readonly tt: number) {
  }

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
  constructor(tt: number, private readonly altUriPrefix: string) {
    super(tt);
  }

  public create(v: number): Component {
    return new Component(this.tt, Encoder.encode(NNI(v), 8));
  }

  public parse(comp: Component): number {
    return NNI.decode(comp.value);
  }

  public toAltUri(comp: Component): string {
    return `${this.altUriPrefix}=${this.parse(comp)}`;
  }
}

type TimestampConvention = NamingConvention<number|Date, number> & NamingConvention.WithAltUri;
class TimestampMicros extends Typed implements TimestampConvention {
  constructor() {
    super(0x24);
  }

  public create(v: number|Date): Component {
    return this.createImpl(v, 1);
  }

  protected createImpl(v: number|Date, unit: number): Component {
    if (typeof v === "number") {
      v *= unit;
    } else {
      v = v.getTime() * 1000;
    }
    return TypedNumber.prototype.create.call(this, v);
  }

  public parse(comp: Component): number {
    return TypedNumber.prototype.parse.call(this, comp);
  }

  public toAltUri(comp: Component): string {
    const v = TypedNumber.prototype.parse.call(this, comp);
    return `t=${v}`;
  }
}

class TimestampMillis extends TimestampMicros implements TimestampConvention {
  public parse(comp: Component): number {
    const v = super.parse(comp);
    if (v > 8787511468039992) {
      // Beyond this number, v/1000 may lose precision.
      throw new Error("timestamp number too large");
    }
    return v / 1000;
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

/** TimestampNameComponent, interpreted as number in milliseconds. */
export const Timestamp = Object.assign(
  new TimestampMillis() as TimestampConvention,
  {
    /** TimestampNameComponent, interpreted as number in milliseconds. */
    ms: new TimestampMillis() as TimestampConvention,
    /** TimestampNameComponent, interpreted as number in microseconds. */
    us: new TimestampMicros() as TimestampConvention,
  });

/** SequenceNumNameComponent, interpreted as number. */
export const SequenceNum: NumberConvention = new TypedNumber(0x25, "seq");
