import { Transform } from "readable-stream";

/** Break packet-sized buffers into random-sized buffers, for testing TCP/Unix transports. */
export class BufferBreaker extends Transform {
  private buf?: Buffer;
  private timer: NodeJS.Timer;

  constructor() {
    super({ readableObjectMode: true, writableObjectMode: false });
    this.timer = setInterval(this.flushBuf, 100);
  }

  public _transform(chunk: Buffer, enc: unknown, callback: (err?: Error) => void) {
    const buf = this.buf ? Buffer.concat([this.buf, chunk]) : chunk;
    const count = Math.min(buf.length, Math.ceil(Math.random() * 1.5 * buf.length));
    this.push(buf.subarray(0, count));
    this.buf = buf.subarray(count);
    callback();
  }

  public _flush(callback: (err?: Error) => void) {
    this.flushBuf();
    callback();
  }

  public _destroy(err: Error, callback: (err: Error|null) => void) {
    clearInterval(this.timer);
    callback(err);
  }

  public _final(callback: () => void) {
    clearInterval(this.timer);
    callback();
  }

  private flushBuf = () => {
    if (!this.buf) {
      return;
    }
    this.push(this.buf);
    this.buf = undefined;
  };
}
