import { Data, Interest, LLSign, TT } from "@ndn/l3pkt";
import { LpRx } from "@ndn/lp";
import { Decoder, Encoder, printTT, toHex } from "@ndn/tlv";
import { EventEmitter } from "events";
import { pipeline, Writable } from "readable-stream";
import { StrictEventEmitter } from "strict-event-emitter-types";

import { Transport } from "./transport";

/** Packet types that can be transmitted. */
type TxPacket = Interest | Data;

interface Events {
  /** Emitted when an Interest arrives. */
  interest: Interest;
  /** Emitted when a Data arrives. */
  data: Data;
  /** Emitted upon end of RX stream. */
  end: Error|undefined;
  /** Emitted upon RX decoding error. */
  rxerror: LLFace.RxError;
  /** Emitted upon TX preparation error. */
  txerror: LLFace.TxError;
}

type Emitter = StrictEventEmitter<EventEmitter, Events>;

/** Low-level face for sending and receiving L3 packets. */
export class LLFace extends (EventEmitter as new() => Emitter) {
  constructor(public readonly transport: Transport) {
    super();
    pipeline(
      transport.rx,
      new LpRx(),
      new Writable({
        objectMode: true,
        write: this.rxWrite,
      }),
      (error) => this.emit("end", error || undefined),
    );
  }

  /** Transmit an Interest. */
  public sendInterest(interest: Interest) {
    this.txWrite(interest);
  }

  /** Transmit a Data. */
  public sendData(data: Data) {
    this.txWrite(data);
  }

  public close(): Promise<void> {
    return this.transport.close();
  }

  private rxWrite = ({ type, decoder, tlv }: Decoder.Tlv, encoding,
                     callback: (error?: Error) => any): void => {
    try {
      switch (type) {
        case TT.Interest:
          const interest = decoder.decode(Interest);
          this.emit("interest", interest);
          break;
        case TT.Data:
          const data = decoder.decode(Data);
          this.emit("data", data);
          break;
        default:
          throw new Error(`TLV-TYPE ${printTT(type)} cannot appear at top level`);
      }
    } catch (err) {
      this.emit("rxerror", new LLFace.RxError(err, tlv));
    }
    callback();
  }

  private txWrite(packet: TxPacket) {
    packet[LLSign.PROCESS]()
    .then(() => this.transport.tx.write(Encoder.encode(packet)),
          (error) => this.emit("txerror", new LLFace.TxError(error, packet)));
  }
}

export namespace LLFace {
  export class RxError extends Error {
    constructor(inner: Error, public packet: Uint8Array) {
      super(`${inner.message} ${toHex(packet)}`);
    }
  }

  export class TxError extends Error {
    constructor(inner: Error, public packet: TxPacket) {
      super(`${inner.message} ${packet.name.toString()}`);
    }
  }
}
