import { Component, NamingConvention, TT } from "@ndn/packet";
import { Encoder, NNI } from "@ndn/tlv";

class Markered {
  private readonly marker: Uint8Array;

  constructor(marker: number) {
    this.marker = Uint8Array.of(marker);
  }

  public match(comp: Component): boolean {
    return comp.type === TT.GenericNameComponent &&
           [2, 3, 5, 9].includes(comp.length) &&
           comp.value[0] === this.marker[0];
  }

  public create(v: number): Component {
    return new Component(TT.GenericNameComponent, Encoder.encode([this.marker, NNI(v)], 8));
  }

  public parse(comp: Component): number {
    return NNI.decode(comp.value.subarray(1));
  }
}

/** Segment number marker. */
export const Segment = new Markered(0x00) as NamingConvention<number, number>;

/** Byte offset marker. */
export const ByteOffset = new Markered(0xFB) as NamingConvention<number, number>;

/** Version marker. */
export const Version = new Markered(0xFD) as NamingConvention<number, number>;

/** Timestamp marker. */
export const Timestamp = new Markered(0xFC) as NamingConvention<number, number>;

/** Sequence number marker. */
export const SequenceNum = new Markered(0xFE) as NamingConvention<number, number>;
