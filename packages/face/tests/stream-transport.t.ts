import { Decoder, Encoder } from "@ndn/tlv";
import "@ndn/tlv/lib/expect";
import { finished as finishedCb, Transform } from "readable-stream";
import { BufferWritableMock, ObjectReadableMock, ObjectWritableMock, BufferReadableMock } from "stream-mock";
import { promisify } from "util";

import { StreamTransport } from "../src";
import { Interest, Data } from "@ndn/l3pkt";

const finished = promisify(finishedCb);

test("receive", async () => {
  const rxRemote = new ObjectReadableMock([
    Buffer.from([0xF1]),
    Buffer.from([0x01, 0x10, 0xF2]),
    Buffer.from([0x02]),
    Buffer.from([0x20, 0x21]),
  ]);
  const rxLocal = new ObjectWritableMock();
  const transport = new StreamTransport(rxRemote, new BufferWritableMock());
  transport.rx.pipe(rxLocal);

  await finished(rxLocal);
  expect(rxLocal.data).toHaveLength(2);
  expect((rxLocal.data[0] as Decoder.Tlv).type).toBe(0xF1);
  expect((rxLocal.data[1] as Decoder.Tlv).type).toBe(0xF2);
});

test("error on receive incomplete", (done) => {
  expect.hasAssertions();

  const rxRemote = new BufferReadableMock([0xF1]);
  const rxLocal = new ObjectWritableMock();
  const transport = new StreamTransport(rxRemote, new BufferWritableMock());
  transport.rx.on("error", (err) => {
    expect(err).toBeInstanceOf(Error);
    done();
  });
  transport.rx.pipe(rxLocal);
});

test("send", async () => {
  const txRemote = new BufferWritableMock();
  const transport = new StreamTransport(new BufferReadableMock([]), txRemote);

  const pkt = new Uint8Array([0xF0, 0x01, 0x44]);
  transport.tx.write(pkt);
  transport.tx.end();

  await finished(txRemote);
  expect(txRemote.flatData).toEqualUint8Array(pkt);
});

class Interest2Data extends Transform {
  _transform(chunk: Buffer, encoding, callback: (error?: Error) => any) {
    const interest = new Decoder(chunk).decode(Interest);
    const data = new Data(interest.name);
    const encoder = new Encoder();
    encoder.encode(data);
    this.push(encoder.output);
    callback();
  }
}

test("interest2data", async () => {
  const rxLocal = new ObjectWritableMock();
  const transport = new StreamTransport(new Interest2Data());
  transport.rx.pipe(rxLocal);

  for (let i = 0; i < 64; ++i) {
    const interest = new Interest(`/A/${i}`);
    transport.tx.write(Encoder.encode(interest));
  }
  transport.tx.end();

  await finished(rxLocal);
  expect(rxLocal.data).toHaveLength(64);
  for (let i = 0; i < 64; ++i) {
    const { decoder } = rxLocal.data[i] as Decoder.Tlv;
    const data = decoder.decode(Data);
    expect(data.name.toString()).toBe(`/A/${i}`);
  }
});
