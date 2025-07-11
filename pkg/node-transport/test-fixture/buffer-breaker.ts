import { pipeline, Transform } from "node:stream";

/** Break packet-sized buffers into random-sized buffers, for testing TCP/Unix transports. */
export class BufferBreaker extends Transform {
  private buf?: Buffer; // eslint-disable-line @typescript-eslint/no-restricted-types
  private timer: NodeJS.Timeout;

  constructor() {
    super({ readableObjectMode: true, writableObjectMode: false });
    this.timer = setInterval(this.flushBuf, 50);
  }

  // eslint-disable-next-line @typescript-eslint/no-restricted-types
  public override _transform(chunk: Buffer, enc: unknown, callback: (err?: Error) => void) {
    void enc;
    const buf = this.buf ? Buffer.concat([this.buf, chunk]) : chunk;
    const count = Math.min(buf.length, Math.ceil(Math.random() * 1.5 * buf.length));
    this.push(buf.subarray(0, count));
    this.buf = buf.subarray(count);
    callback();
  }

  public override _flush(callback: (err?: Error) => void) {
    this.flushBuf();
    callback();
  }

  public override _destroy(err: Error, callback: (err: Error | undefined) => void) {
    clearInterval(this.timer);
    callback(err);
  }

  public override _final(callback: () => void) {
    clearInterval(this.timer);
    callback();
  }

  private readonly flushBuf = () => {
    if (!this.buf) {
      return;
    }
    this.push(this.buf);
    this.buf = undefined;
  };
}

export namespace BufferBreaker {
  /** Connect two streams together via BufferBreakers. */
  export function duplex(a: NodeJS.ReadWriteStream, b: NodeJS.ReadWriteStream) {
    pipeline(a, new BufferBreaker(), b, new BufferBreaker(), a, () => undefined);
  }
}
