import { Data, Interest, LLSign, TT } from "@ndn/l3pkt";
import { LpService } from "@ndn/lp";
import { Decoder, Encoder, printTT, toHex } from "@ndn/tlv";
import { EventEmitter } from "events";
import { pipeline } from "streaming-iterables";
import StrictEventEmitter from "strict-event-emitter-types";

import { mapFilter } from "./internal";
import { Transport } from "./transport";

type Packet = Interest | Data;

interface Events {
  /** Emitted upon RX decoding error. */
  rxerror: LLFace.RxError;
  /** Emitted upon TX preparation error. */
  txerror: LLFace.TxError;
}

type Emitter = StrictEventEmitter<EventEmitter, Events>;

/** Low-level face for sending and receiving L3 packets. */
export class LLFace extends (EventEmitter as new() => Emitter) {
  public readonly lp = new LpService();
  public readonly rx: AsyncIterable<Packet>;

  constructor(public readonly transport: Transport) {
    super();
    this.rx = pipeline(
      () => transport.rx,
      this.lp.rx,
      mapFilter(this.decode),
    );
  }

  public async tx(iterable: AsyncIterable<Packet>) {
    await pipeline(
      () => iterable,
      mapFilter(this.encode),
      this.transport.tx,
    );
  }

  private encode = async (packet: Packet): Promise<Uint8Array|undefined> => {
    try {
      await packet[LLSign.PROCESS]();
    } catch (err) {
      this.emit("txerror", new LLFace.TxError(err, packet));
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
      this.emit("rxerror", new LLFace.RxError(err, tlv));
    }
    return undefined;
  }
}

export namespace LLFace {
  export class RxError extends Error {
    constructor(inner: Error, public packet: Uint8Array) {
      super(`${inner.message} ${toHex(packet)}`);
    }
  }

  export class TxError extends Error {
    constructor(inner: Error, public packet: Packet) {
      super(`${inner.message} ${packet.name.toString()}`);
    }
  }
}
