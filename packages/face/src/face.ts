import { Data, Interest } from "@ndn/l3pkt";
import { Decoder, Encoder } from "@ndn/tlv";
import { TT } from "@ndn/tt-base";
import SimpleSignal from "simplesignal";

import { Writable } from "readable-stream";
import { Transport } from "./transport";

/** Layer-3 face for sending and receiving L3 packets. */
export class Face {
  /** Emitted when an Interest arrives. */
  public recvInterest = new SimpleSignal<(interest: Interest) => any>();
  /** Emitted when a Data arrives. */
  public recvData = new SimpleSignal<(data: Data) => any>();
  /** Emitted when RX error occurs. */
  public rxError = new SimpleSignal<(error: Error) => any>();

  constructor(private transport: Transport) {
    transport.rx.pipe(new Writable({
      objectMode: true,
      write: this.rxWrite,
    }));
  }

  /** Transmit an Interest. */
  public sendInterest(interest: Interest) {
    this.transport.tx.write(Encoder.encode(interest));
  }

  /** Transmit a Data. */
  public sendData(data: Data) {
    this.transport.tx.write(Encoder.encode(data));
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
