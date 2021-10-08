import { Component, NamingConvention, TT } from "@ndn/packet";
import { Encoder, NNI } from "@ndn/tlv";

interface NumberConvention extends NamingConvention<number | bigint, number> {}

class Markered implements NumberConvention {
  private readonly marker: Uint8Array;

  constructor(marker: number) {
    this.marker = Uint8Array.of(marker);
  }

  public match(comp: Component): boolean {
    return comp.type === TT.GenericNameComponent &&
           [2, 3, 5, 9].includes(comp.length) &&
           comp.value[0] === this.marker[0];
  }

  public create(v: number | bigint): Component {
    return new Component(undefined, Encoder.encode([this.marker, NNI(v)], 9));
  }

  public parse(comp: Component): number {
    return NNI.decode(comp.value.subarray(1));
  }
}

/** Segment number marker. */
export const Segment: NumberConvention = new Markered(0x00);

/** Byte offset marker. */
export const ByteOffset: NumberConvention = new Markered(0xFB);

/** Version marker. */
export const Version: NumberConvention = new Markered(0xFD);

/** Timestamp marker. */
export const Timestamp: NumberConvention = new Markered(0xFC);

/** Sequence number marker. */
export const SequenceNum: NumberConvention = new Markered(0xFE);
