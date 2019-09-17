import { Data, Interest } from "@ndn/l3pkt";
import { Decoder, Encoder } from "@ndn/tlv";
import { TT } from "@ndn/tt-base";
import * as stream from "readable-stream";
import SimpleSignal from "simplesignal";

import { Transport } from "./transport";

/** Low-level face for sending and receiving L3 packets. */
export class LLFace {
  /** Emitted when an Interest arrives. */
  public recvInterest = new SimpleSignal<(interest: Interest) => any>();
  /** Emitted when a Data arrives. */
  public recvData = new SimpleSignal<(data: Data) => any>();
  /** Emitted when RX error occurs. */
  public rxError = new SimpleSignal<(error: Error) => any>();

  constructor(public readonly transport: Transport) {
    stream.pipeline(
      transport.rx,
      new stream.Writable({
        objectMode: true,
        write: this.rxWrite,
      }),
      () => { this.rxError.dispatch(new Error("Transport closed")); },
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

  private rxWrite = ({ type, decoder }: Decoder.Tlv, encoding,
                     callback: (error?: Error) => any): void => {
    try {
      switch (type) {
        case TT.Interest:
          const interest = decoder.decode(Interest);
          this.recvInterest.dispatch(interest);
          break;
        case TT.Data:
          const data = decoder.decode(Data);
          this.recvData.dispatch(data);
          break;
        default:
          throw new Error(`TLV-TYPE ${TT.toString(type)} cannot appear at top level`);
      }
    } catch (err) {
      this.rxError.dispatch(err);
    }
    callback();
  }
}
