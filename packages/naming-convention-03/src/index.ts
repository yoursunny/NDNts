import { Component, NamingConvention } from "@ndn/name";
import { NNI } from "@ndn/tlv";

abstract class Typed {
  constructor(protected tt: number) {
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
    return new Component(this.tt, NNI.encode(v));
  }

  public parse(comp: Component): number {
    return NNI.decode(comp.value);
  }
}

class TypedDate extends Typed implements NamingConvention<Date> {
  constructor(tt: number) {
    super(tt);
  }

  public create(v: Date): Component {
    return TypedNumber.prototype.create.call(this, v.getTime() * 1000);
  }

  public parse(comp: Component, strict: boolean = false): Date {
    const n = TypedNumber.prototype.parse.call(this, comp);
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
export const Timestamp = new TypedDate(0x24);

/** SequenceNumNameComponent */
export const SequenceNum = new TypedNumber(0x25);
