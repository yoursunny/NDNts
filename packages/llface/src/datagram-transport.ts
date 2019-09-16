import { Decoder } from "@ndn/tlv";
import { Transform } from "readable-stream";

import { Transport } from "./transport";

class DatagramRx extends Transform {
  constructor() {
    super({ objectMode: true });
  }

  public _transform(chunk: Buffer, encoding, callback: (error?: Error) => any): void {
    const decoder = new Decoder(chunk);
    try {
      this.push(decoder.read());
    } catch {
      // ignore error
    }
    callback();
  }
}

/** Datagram-oriented transport. */
export class DatagramTransport implements Transport {
  public readonly rx = new DatagramRx();

  constructor(rx: NodeJS.ReadableStream, public readonly tx: NodeJS.WritableStream) {
    rx.pipe(this.rx);
  }
}
