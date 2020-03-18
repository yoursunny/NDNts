import { Component, NamingConvention, TT } from "@ndn/packet";
import { Encoder, NNI } from "@ndn/tlv";

class Markered implements NamingConvention<number> {
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
export const Segment = new Markered(0x00);

/** Byte offset marker. */
export const ByteOffset = new Markered(0xFB);

/** Version marker. */
export const Version = new Markered(0xFD);

/** Timestamp marker. */
export const Timestamp = new Markered(0xFC);

/** Sequence number marker. */
export const SequenceNum = new Markered(0xFE);
