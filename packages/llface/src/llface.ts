import { Data, Interest, TT } from "@ndn/l3pkt";
import { Decoder, Encoder, printTT, toHex } from "@ndn/tlv";
import { EventEmitter } from "events";
import { pipeline, Writable } from "readable-stream";
import { StrictEventEmitter } from "strict-event-emitter-types";

import { Transport } from "./transport";

interface Events {
  /** Emitted when an Interest arrives. */
  interest: Interest;
  /** Emitted when a Data arrives. */
  data: Data;
  /** Emitted upon end of RX stream. */
  end: Error|undefined;
  /** Emitted upon RX decoding error. */
  rxerror: LLFace.DecodeError;
}

type Emitter = StrictEventEmitter<EventEmitter, Events>;

/** Low-level face for sending and receiving L3 packets. */
export class LLFace extends (EventEmitter as new() => Emitter) {
  constructor(public readonly transport: Transport) {
    super();
    pipeline(
      transport.rx,
      new Writable({
        objectMode: true,
        write: this.rxWrite,
      }),
      (error) => this.emit("end", error || undefined),
    );
  }

  /** Transmit an Interest. */
  public sendInterest(interest: Interest) {
    this.transport.tx.write(Encoder.encode(interest));
  }

  /** Transmit a Data. */
  public sendData(data: Data) {
    this.transport.tx.write(Encoder.encode(data));
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
      this.emit("rxerror", new LLFace.DecodeError(err, tlv));
    }
    callback();
  }
}

export namespace LLFace {
  export class DecodeError extends Error {
    constructor(inner: Error, public packet: Uint8Array) {
      super(`${inner.message} ${toHex(packet)}`);
    }
  }
}
