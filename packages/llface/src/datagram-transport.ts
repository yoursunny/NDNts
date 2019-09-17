import { Decoder } from "@ndn/tlv";
import * as stream from "readable-stream";

import { BaseTransport } from "./base-transport";
import { Transport } from "./transport";

class DatagramRx extends stream.Transform {
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
export class DatagramTransport extends BaseTransport<DatagramRx> implements Transport {
  constructor(conn: NodeJS.ReadWriteStream) {
    super(new DatagramRx(), conn);
    stream.pipeline(conn, this.rx, this.handlePipelineError);
  }

  public async close(): Promise<void> {
    return this.closeImpl(() => { this.tx.end(); });
  }
}
