import { Decoder } from "@ndn/tlv";
import { pipeline, Transform } from "readable-stream";

import { BaseTransport } from "./base-transport";
import { Transport } from "./transport";

class StreamRx extends Transform {
  private buf: Buffer = Buffer.alloc(0);

  constructor() {
    super({
      readableObjectMode: true,
      writableObjectMode: false,
    });
  }

  public _transform(chunk: Buffer, encoding, callback: (error?: Error) => any): void {
    if (this.buf.length > 0) {
      this.buf = Buffer.concat([this.buf, chunk], this.buf.length + chunk.length);
    } else {
      this.buf = chunk;
    }
    const decoder = new Decoder(this.buf);
    let consumed = 0;
    while (true) {
      let tlv: Decoder.Tlv;
      try {
        tlv = decoder.read();
      } catch (ex) {
        break;
      }
      this.push(tlv);
      consumed += tlv.size;
    }
    if (consumed > 0) {
      this.buf = this.buf.subarray(consumed);
    }
    callback();
  }

  public _flush(callback: (error?: Error) => any): void {
    if (this.buf.length > 0) {
      callback(new Error("incomplete TLV in buffer"));
      return;
    }
    callback();
  }
}

/** Stream-oriented transport. */
export class StreamTransport extends BaseTransport implements Transport {
  public rx = new StreamRx();
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
