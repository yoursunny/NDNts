import { Component, NamingConvention } from "@ndn/name";
import { Encoder, NNI } from "@ndn/tlv";

abstract class Typed {
  constructor(protected readonly tt: number) {
  }

  public match(comp: Component): boolean {
    return comp.type === this.tt;
  }
}

class TypedString extends Typed {
  constructor(tt: number) {
    super(tt);
  }

  public create(v: string): Component {
    return new Component(this.tt, v);
  }

  public parse(comp: Component): string {
    return comp.text;
  }
}

class TypedNumber extends Typed {
  constructor(tt: number) {
    super(tt);
  }

  public create(v: number): Component {
    return new Component(this.tt, Encoder.encode(NNI(v), 8));
  }

  public parse(comp: Component): number {
    return NNI.decode(comp.value);
  }
}

abstract class TimestampBase extends Typed {
  constructor() {
    super(0x24);
  }

  public create(v: number|Date): Component {
    if (typeof v !== "number") {
      v = v.getTime() * 1000;
    }
    return TypedNumber.prototype.create.call(this, v);
  }
}

class TimestampNumber extends TimestampBase {
  public parse(comp: Component): number {
    return TypedNumber.prototype.parse.call(this, comp);
  }
}

class TimestampDate extends TimestampBase {
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
export const Keyword = new TypedString(0x20) as NamingConvention<string, string>;

/** SegmentNameComponent, interpreted as number. */
export const Segment = new TypedNumber(0x21) as NamingConvention<number, number>;

/** ByteOffsetNameComponent, interpreted as number. */
export const ByteOffset = new TypedNumber(0x22) as NamingConvention<number, number>;

/** VersionNameComponent, interpreted as number. */
export const Version = new TypedNumber(0x23) as NamingConvention<number, number>;

/** TimestampNameComponent, interpreted as number. */
export const Timestamp = Object.assign(
  new TimestampNumber() as NamingConvention<number|Date, number>,
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
export const SequenceNum = new TypedNumber(0x25) as NamingConvention<number, number>;
