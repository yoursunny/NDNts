import { Component, NamingConvention } from "@ndn/name";
import { Encoder, NNI } from "@ndn/tlv";

abstract class Typed {
  constructor(protected readonly tt: number) {
  }

  public match(comp: Component): boolean {
    return comp.type === this.tt;
  }
}

class TypedString extends Typed implements NamingConvention<string> {
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

class TypedNumber extends Typed implements NamingConvention<number> {
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

class TimestampType extends TypedNumber {
  constructor() {
    super(0x24);
  }

  public create(v: number|Date): Component {
    if (typeof v !== "number") {
      v = v.getTime() * 1000;
    }
    return super.create(v);
  }

  public parseDate(comp: Component, strict: boolean = false): Date {
    const n = this.parse(comp);
    if (strict && n % 1000 !== 0) {
      throw new Error("Timestamp is not multiple of milliseconds");
    }
    return new Date(n / 1000);
  }
}

/** KeywordNameComponent */
export const Keyword = new TypedString(0x20);

/** SegmentNameComponent */
export const Segment = new TypedNumber(0x21);

/** ByteOffsetNameComponent */
export const ByteOffset = new TypedNumber(0x22);

/** VersionNameComponent */
export const Version = new TypedNumber(0x23);

/** TimestampNameComponent */
export const Timestamp = new TimestampType();

/** SequenceNumNameComponent */
export const SequenceNum = new TypedNumber(0x25);
