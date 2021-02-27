import { Data, Interest, Nack, TT as l3TT } from "@ndn/packet";
import { Decoder, Encoder, printTT, toHex } from "@ndn/tlv";
import itKeepAlive from "it-keepalive";

import { TT } from "./an";
import { Fragmenter } from "./fragmenter";
import { LpPacket } from "./packet";
import { Reassembler } from "./reassembler";

const IDLE = Encoder.encode(new LpPacket());

export class LpService {
  constructor({
    keepAlive = 60000,
    mtu = Infinity,
    reassemblerCapacity = 16,
  }: LpService.Options = {}) {
    if (keepAlive === false || keepAlive <= 0) {
      this.keepAlive = -1;
    } else {
      this.keepAlive = keepAlive;
    }
    if (Number.isFinite(mtu)) {
      this.mtu = mtu;
      this.fragmenter = new Fragmenter(mtu);
    }
    this.reassembler = new Reassembler(reassemblerCapacity);
  }

  private readonly keepAlive: number;
  private readonly mtu = Infinity;
  private readonly fragmenter?: Fragmenter;
  private readonly reassembler: Reassembler;

  public rx = (iterable: AsyncIterable<Decoder.Tlv>) => {
    return this.rx_(iterable);
  };

  private async *rx_(iterable: AsyncIterable<Decoder.Tlv>): AsyncIterable<LpService.Packet|LpService.RxError> {
    for await (const tlv of iterable) {
      yield* this.decode(tlv);
    }
  }

  private *decode(tlv: Decoder.Tlv) {
    try {
      const { type, decoder } = tlv;
      if (type !== TT.LpPacket) {
        yield this.decodeL3(tlv);
        return;
      }

      const fragment = decoder.decode(LpPacket);
      const lpp = this.reassembler.accept(fragment);
      if (!lpp || !lpp.payload) {
        return;
      }

      const l3pkt = this.decodeL3(new Decoder(lpp.payload).read());
      if (lpp.nack) {
        if (l3pkt.l3 instanceof Interest) {
          l3pkt.l3 = new Nack(l3pkt.l3, lpp.nack);
        } else {
          throw new Error("Nack can only appear on Interest");
        }
      }
      l3pkt.token = lpp.pitToken;
      yield l3pkt;
    } catch (err: unknown) {
      yield new LpService.RxError(err as Error, tlv.tlv);
    }
  }

  private decodeL3({ type, decoder }: Decoder.Tlv): LpService.Packet {
    switch (type) {
      case l3TT.Interest:
        return { l3: decoder.decode(Interest) };
      case l3TT.Data:
        return { l3: decoder.decode(Data) };
      default:
        throw new Error(`unrecognized TLV-TYPE ${printTT(type)} as L3Pkt`);
    }
  }

  public tx = (iterable: AsyncIterable<LpService.Packet>) => {
    let iterable1: AsyncIterable<LpService.Packet|false> = iterable;
    if (this.keepAlive > 0) {
      iterable1 = itKeepAlive<LpService.Packet|false>(
        () => false,
        { timeout: this.keepAlive },
      )(iterable);
    }
    return this.tx_(iterable1);
  };

  private async *tx_(iterable: AsyncIterable<LpService.Packet|false>): AsyncIterable<Uint8Array|LpService.TxError> {
    for await (const pkt of iterable) {
      if (pkt === false) {
        yield IDLE;
      } else {
        yield* this.encode(pkt);
      }
    }
  }

  private *encode({ l3, token }: LpService.Packet): Iterable<Uint8Array|LpService.TxError> {
    let lpp: LpPacket;
    try {
      switch (true) {
        case l3 instanceof Interest:
        case l3 instanceof Data: {
          const payload = Encoder.encode(l3 as Interest|Data);
          if (!token && payload.length <= this.mtu) {
            return yield payload;
          }
          lpp = new LpPacket();
          lpp.pitToken = token;
          lpp.payload = payload;
          break;
        }
        case l3 instanceof Nack: {
          const nack = l3 as Nack;
          lpp = new LpPacket();
          lpp.pitToken = token;
          lpp.nack = nack.header;
          lpp.payload = Encoder.encode(nack.interest);
          break;
        }
        default:
          return;
      }
    } catch (err: unknown) {
      return yield new LpService.TxError(err as Error, l3);
    }

    if (this.fragmenter) {
      yield* this.fragmenter.fragment(lpp).map((fragment) => Encoder.encode(fragment, this.mtu));
    } else {
      yield Encoder.encode(lpp);
    }
  }
}

export namespace LpService {
  export interface Options {
    /**
     * How often to send IDLE packets if nothing else was sent, in millis.
     * Set false or zero to disable keep-alive.
     * @default 60000
     */
    keepAlive?: false|number;

    /**
     * MTU for fragmentation.
     * Set Infinity to disable fragmentation.
     * @default Infinity
     */
    mtu?: number;

    /**
     * Maximum number of partial packets kept in the reassembler.
     * @default 16
     */
    reassemblerCapacity?: number;
  }

  type L3Pkt = Interest|Data|Nack;

  export interface Packet {
    l3: L3Pkt;
    token?: Uint8Array;
  }

  export class RxError extends Error {
    constructor(inner: Error, public readonly packet: Uint8Array) {
      super(`${inner.message} ${toHex(packet)}`);
    }
  }

  export class TxError extends Error {
    constructor(inner: Error, public readonly packet: L3Pkt) {
      super(`${inner.message} ${packet instanceof Nack ? packet.interest.name : packet.name}`);
    }
  }
}
