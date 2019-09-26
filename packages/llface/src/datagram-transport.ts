import { Decoder } from "@ndn/tlv";
import { pipeline, Transform } from "readable-stream";

import { BaseTransport } from "./base-transport";
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
export class DatagramTransport extends BaseTransport implements Transport {
  public rx = new DatagramRx();
  public tx: NodeJS.WritableStream;

  constructor(conn: NodeJS.ReadWriteStream) {
    super();
    pipeline(conn, this.rx, this.handlePipelineError);
    this.tx = conn;
  }

  public async close(): Promise<void> {
    return this.closeImpl(() => { this.tx.end(); });
  }
}
