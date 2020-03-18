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

class TypedNumber extends Typed implements NamingConvention<number>, NamingConvention.WithAltUri {
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

abstract class TimestampBase extends Typed implements NamingConvention.WithAltUri {
  constructor() {
    super(0x24);
  }

  public create(v: number|Date): Component {
    if (typeof v !== "number") {
      v = v.getTime() * 1000;
    }
    return TypedNumber.prototype.create.call(this, v);
  }

  protected asNumber(comp: Component): number {
    return TypedNumber.prototype.parse.call(this, comp);
  }

  public toAltUri(comp: Component): string {
    return `t=${this.asNumber(comp)}`;
  }
}

class TimestampNumber extends TimestampBase implements NamingConvention<number|Date, number> {
  public parse(comp: Component): number {
    return this.asNumber(comp);
  }
}

class TimestampDate extends TimestampBase implements NamingConvention<number|Date, Date> {
  constructor(private readonly strict: boolean) {
    super();
  }

  public parse(comp: Component): Date {
    const n = TypedNumber.prototype.parse.call(this, comp);
    if (this.strict && n % 1000 !== 0) {
      throw new Error("Timestamp is not multiple of milliseconds");
    }
    return new Date(n / 1000);
  }
}

/** KeywordNameComponent, interpreted as string. */
export const Keyword = new TypedString(0x20);

/** SegmentNameComponent, interpreted as number. */
export const Segment = new TypedNumber(0x21, "seg");

/** ByteOffsetNameComponent, interpreted as number. */
export const ByteOffset = new TypedNumber(0x22, "off");

/** VersionNameComponent, interpreted as number. */
export const Version = new TypedNumber(0x23, "v");

/** TimestampNameComponent, interpreted as number. */
export const Timestamp = Object.assign(
  new TimestampNumber(),
  {
    /**
     * TimestampNameComponent, interpreted as Date.
     * Reject during parsing if value is not a multiple of milliseconds.
     */
    Date: new TimestampDate(true) as NamingConvention<number|Date, Date>,

    /**
     * TimestampNameComponent, interpreted as Date.
     * Round to nearest milliseconds during parsing.
     */
    DateInexact: new TimestampDate(false) as NamingConvention<number|Date, Date>,
  });

/** SequenceNumNameComponent, interpreted as number. */
export const SequenceNum = new TypedNumber(0x25, "seq");
