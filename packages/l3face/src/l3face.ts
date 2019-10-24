import { Data, Interest, LLSign, TT } from "@ndn/l3pkt";
import { LpService } from "@ndn/lp";
import { Decoder, Encoder, printTT, toHex } from "@ndn/tlv";
import { EventEmitter } from "events";
import { filter, map, pipeline } from "streaming-iterables";
import StrictEventEmitter from "strict-event-emitter-types";

import { Transport } from "./transport";

type Packet = Interest | Data;

interface Events {
  /** Emitted upon RX decoding error. */
  rxerror: L3Face.RxError;
  /** Emitted upon TX preparation error. */
  txerror: L3Face.TxError;
}

type Emitter = StrictEventEmitter<EventEmitter, Events>;

/** Network layer face for sending and receiving L3 packets. */
export class L3Face extends (EventEmitter as new() => Emitter) {
  public readonly lp = new LpService();
  public readonly rx: AsyncIterable<Packet>;

  constructor(public readonly transport: Transport) {
    super();
    this.rx = pipeline(
      () => transport.rx,
      this.lp.rx,
      map(this.decode),
      filter((pktOrUndefined): pktOrUndefined is Packet => !!pktOrUndefined),
    );
  }

  public async tx(iterable: AsyncIterable<Packet>) {
    await pipeline(
      () => iterable,
      map(this.encode),
      filter((pktOrUndefined): pktOrUndefined is Uint8Array => !!pktOrUndefined),
      this.transport.tx,
    );
  }

  public toString() {
    return this.transport.toString();
  }

  private encode = async (packet: Packet): Promise<Uint8Array|undefined> => {
    try {
      await packet[LLSign.PROCESS]();
    } catch (err) {
      this.emit("txerror", new L3Face.TxError(err, packet));
      return undefined;
    }
    return Encoder.encode(packet);
  }

  private decode = ({ type, decoder, tlv }: Decoder.Tlv): Packet|undefined => {
    try {
      switch (type) {
        case TT.Interest:
          return decoder.decode(Interest);
        case TT.Data:
          return decoder.decode(Data);
        default:
          throw new Error(`TLV-TYPE ${printTT(type)} cannot appear at top level`);
      }
    } catch (err) {
      this.emit("rxerror", new L3Face.RxError(err, tlv));
    }
    return undefined;
  }
}

export namespace L3Face {
  export class RxError extends Error {
    constructor(inner: Error, public packet: Uint8Array) {
      super(`${inner.message} ${toHex(packet)}`);
    }
  }

  export class TxError extends Error {
    constructor(inner: Error, public packet: Packet) {
      super(`${inner.message} ${packet.name}`);
    }
  }
}
