import duplexify from "duplexify";
import { Readable, Transform } from "readable-stream";
import * as rPromise from "remote-controlled-promise";
import { BufferReadableMock, BufferWritableMock, ObjectWritableMock } from "stream-mock";

import { StreamTransport } from "../src";
import * as TestTransport from "../test-fixture/transport";

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
  TestTransport.check(await TestTransport.execute(tA, tB));
});

test("error on receive incomplete", async () => {
  const rxRemote = new BufferReadableMock([0xF1]);
  const rxLocal = new ObjectWritableMock();
  const transport = new StreamTransport(duplexify(new BufferWritableMock(), rxRemote));
  const endErrorP = rPromise.create<Error|undefined>();
  transport.on("end", (error) => endErrorP.resolve(error));
  transport.rx.pipe(rxLocal);

  const endError = await endErrorP.promise;
  expect(endError).not.toBeUndefined();
  expect(endError!.message).toMatch(/incomplete/);
  await transport.close();
});

test("RX error during closing", async () => {
  const rxRemote = new Readable();
  const transport = new StreamTransport(duplexify(new BufferWritableMock(), rxRemote));
  const endErrorP = rPromise.create<Error|undefined>();
  transport.on("end", (error) => endErrorP.resolve(error));
  transport.rx.pipe(transport.tx);

  const closing = transport.close();
  rxRemote.emit("error", new Error("mock RX error"));

  await closing;
  await expect(endErrorP.promise).resolves.toBeUndefined();
});
