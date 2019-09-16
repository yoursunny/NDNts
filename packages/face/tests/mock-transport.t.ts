import { Decoder } from "@ndn/tlv";
import "@ndn/tlv/lib/expect";
import { Writable, finished } from "readable-stream";
import { Readable as nodeReadable } from "stream";
import { promisify } from "util";

import { MockTransport } from "../src";

test("receive", async () => {
  const recv = jest.fn((chunk: Decoder.Tlv, encoding, callback) => { callback(); });
  const sink = new Writable({
    objectMode: true,
    write: recv,
  });

  const transport = new MockTransport();
  transport.rx.pipe(sink);
  transport.rx.mockRx(new Uint8Array([0xF0, 0x01, 0x44]));
  transport.rx.mockClose();

  await promisify(finished)(sink);
  expect(recv).toHaveBeenCalledTimes(1);
  expect(recv.mock.calls[0][0].type).toBe(0xF0);
});

test("send", async () => {
  const pkt = new Uint8Array([0xF0, 0x01, 0x44]);
  const source = nodeReadable.from([pkt]);

  const transport = new MockTransport();
  source.pipe(transport.tx);
  await promisify(finished)(transport.tx);

  expect(transport.tx.mockSent).toHaveLength(1);
  expect(transport.tx.mockSent[0].read().tlv).toEqualUint8Array(pkt);
});
