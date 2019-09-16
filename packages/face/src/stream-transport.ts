import { Decoder } from "@ndn/tlv";
import { PassThrough, Transform } from "readable-stream";

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

class StreamTx extends PassThrough {
  constructor() {
    super({
      readableObjectMode: false,
      writableObjectMode: true,
    });
  }
}

export class StreamTransport extends Transport<StreamRx, StreamTx> {
  constructor(rx: NodeJS.ReadableStream, tx: NodeJS.WritableStream);

  constructor(rxtx: NodeJS.ReadableStream & NodeJS.WritableStream);

  constructor(arg1, arg2?) {
    super(new StreamRx(), new StreamTx());
    let rx: NodeJS.ReadableStream;
    let tx: NodeJS.WritableStream;
    if (arg2) {
      rx = arg1;
      tx = arg2;
    } else {
      rx = arg1;
      tx = arg1;
    }
    rx.pipe(this.rx);
    this.tx.pipe(tx);
  }
}
