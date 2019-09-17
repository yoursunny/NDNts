import duplexify from "duplexify";
import { Transform } from "readable-stream";
import { BufferReadableMock, BufferWritableMock, ObjectWritableMock } from "stream-mock";

import { StreamTransport } from "../src";
import { testTransport } from "../test-fixture";

class BufferBreaker extends Transform {
  private buf = Buffer.alloc(0);

  public _transform(chunk: Buffer, encoding, callback: (error?: Error) => any) {
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
  const connAB = new BufferBreaker();
  const connBA = new BufferBreaker();
  const tA = new StreamTransport(duplexify.obj(connAB, connBA));
  const tB = new StreamTransport(duplexify.obj(connBA, connAB));
  await testTransport(tA, tB);
});

test("error on receive incomplete", (done) => {
  expect.hasAssertions();

  const rxRemote = new BufferReadableMock([0xF1]);
  const rxLocal = new ObjectWritableMock();
  const transport = new StreamTransport(duplexify(new BufferWritableMock(), rxRemote));
  transport.rx.on("error", async (error: Error) => {
    expect(error.message).toEqual(expect.stringContaining("incomplete"));
    await expect(transport.close()).resolves.toBeUndefined();
    done();
  });
  transport.rx.pipe(rxLocal);
});
