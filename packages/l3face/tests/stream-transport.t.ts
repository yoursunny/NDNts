import { Transform } from "readable-stream";

import { StreamTransport } from "..";
import { makeTransportPair } from "../test-fixture/pair";
import * as TestTransport from "../test-fixture/transport";

class BufferBreaker extends Transform {
  private buf = Buffer.alloc(0);

  constructor() {
    super({ readableObjectMode: true, writableObjectMode: false });
  }

  public _transform(chunk: Buffer, enc: unknown, callback: (error?: Error) => any) {
    const buf = Buffer.concat([this.buf, chunk]);
    const count = Math.min(buf.length, Math.ceil(Math.random() * 1.5 * buf.length));
    this.push(buf.subarray(0, count));
    this.buf = buf.subarray(count);
    callback();
  }

  public _flush(callback: (error?: Error) => any) {
    this.push(this.buf);
    this.buf = Buffer.alloc(0);
    callback();
  }
}

test("simple", async () => {
  const [tA, tB] = makeTransportPair(StreamTransport, new BufferBreaker(), new BufferBreaker());
  TestTransport.check(await TestTransport.execute(tA, tB));
});
