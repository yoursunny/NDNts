import { Data, Interest, Nack, TT as l3TT } from "@ndn/packet";
import { Decoder, Encoder, printTT, toHex } from "@ndn/tlv";
import itKeepAlive from "it-keepalive";
import assert from "minimalistic-assert";

import { TT } from "./an";
import { Fragmenter } from "./fragmenter";
import { LpPacket } from "./packet";
import { Reassembler } from "./reassembler";

/**
 * Map and flatten, but only do it once.
 * This differs from flatMap from streaming-iterables that recursively flattens the result.
 */
async function* flatOnceMap<T, R>(
    f: (item: T) => Iterable<R> | AsyncIterable<R>,
    iterable: AsyncIterable<T>,
): AsyncIterable<R> {
  for await (const item of iterable) {
    yield* f(item);
  }
}

const IDLE = Encoder.encode(new LpPacket());

/** NDNLPv2 service. */
export class LpService {
  constructor({
    keepAlive = 60000,
    mtu = Infinity,
    reassemblerCapacity = 16,
  }: LpService.Options = {}) {
    if (Number.isFinite(keepAlive) && keepAlive > 0) {
      this.keepAlive = Math.ceil(keepAlive as number);
    }
    if (Number.isFinite(mtu)) {
      this.mtu = mtu;
      this.fragmenter = new Fragmenter(mtu);
    }
    this.reassembler = new Reassembler(reassemblerCapacity);
  }

  private readonly keepAlive?: number;
  private readonly mtu = Infinity;
  private readonly fragmenter?: Fragmenter;
  private readonly reassembler: Reassembler;

  public rx = (iterable: AsyncIterable<Decoder.Tlv>): AsyncIterable<LpService.Packet | LpService.RxError> => flatOnceMap((tlv) => this.decode(tlv), iterable);

  private *decode(dtlv: Decoder.Tlv) {
    const { type, decoder, tlv } = dtlv;
    try {
      if (type !== TT.LpPacket) {
        yield this.decodeL3(dtlv);
        return;
      }

      const fragment = decoder.decode(LpPacket);
      const lpp = this.reassembler.accept(fragment);
      if (!lpp?.payload) {
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
      yield new LpService.RxError(err as Error, tlv);
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

  public tx = (iterable: AsyncIterable<LpService.Packet>): AsyncIterable<Uint8Array | LpService.TxError> => flatOnceMap(
    (pkt) => this.encode(pkt),
    this.keepAlive ?
      itKeepAlive<LpService.Packet | false>(() => false, { timeout: this.keepAlive })(iterable) :
      iterable,
  );

  private *encode(pkt: LpService.Packet | false): Iterable<Uint8Array | LpService.TxError> {
    if (pkt === false) {
      yield IDLE;
      return;
    }

    const { l3, token } = pkt;
    const lpp = new LpPacket();
    lpp.pitToken = token;
    try {
      if (l3 instanceof Interest || l3 instanceof Data) {
        const payload = Encoder.encode(l3);
        if (!token && payload.length <= this.mtu) {
          return yield payload;
        }
        lpp.payload = payload;
      } else {
        assert(l3 instanceof Nack);
        lpp.nack = l3.header;
        lpp.payload = Encoder.encode(l3.interest);
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
     * How often to send IDLE packets if nothing else was sent, in milliseconds.
     * Set false or zero to disable keep-alive.
     * @default 60000
     */
    keepAlive?: false | number;

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

  type L3Pkt = Interest | Data | Nack;

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
