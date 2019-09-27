import { Decoder } from "@ndn/tlv";
import "@ndn/tlv/test-fixture";
import { pipeline as pipeline_ } from "readable-stream";
import { ObjectReadableMock, ObjectWritableMock } from "stream-mock";
import { promisify } from "util";

import { LpRx } from "../src";

const pipeline = promisify(pipeline_);

test("simple", async () => {
  const input = [
    new Uint8Array([ // LP packet successfully decoded, deliver payload only
      0x64, 0x10,
      0xFD, 0x03, 0x48, 0x08, 0xA0, 0xA1, 0xA2, 0xA3, 0xA4, 0xA5, 0xA6, 0xA7, // TxSeqNum ignored
      0x50, 0x02, 0xC0, 0x00, // Fragment = payload
    ]),
    new Uint8Array([ // LP packet without payload, skip
      0x64, 0x0C,
      0xFD, 0x03, 0x44, 0x08, 0xA0, 0xA1, 0xA2, 0xA3, 0xA4, 0xA5, 0xA6, 0xA7, // Ack ignored
    ]),
    new Uint8Array([ // non LP packet, pass through
      0xC1, 0x00,
    ]),
    new Uint8Array([ // LP packet with decoding error, pass through
      0x64, 0x0E,
      0x81, 0x08, 0xA0, 0xA1, 0xA2, 0xA3, 0xA4, 0xA5, 0xA6, 0xA7, // FragSeqNum unrecognized critical
      0x50, 0x02, 0xC2, 0x00,
    ]),
  ];
  const source = new ObjectReadableMock(input.map((pkt) => new Decoder(pkt).read()));
  const lpRx = new LpRx();
  const sink = new ObjectWritableMock();
  await pipeline(source, lpRx, sink);

  expect(sink.data).toHaveLength(3);
  expect(sink.data[0].tlv).toEqualUint8Array([0xC0, 0x00]);
  expect(sink.data[1].tlv).toEqualUint8Array([0xC1, 0x00]);
  expect(sink.data[2].tlv).toEqualUint8Array(input[3]);
});
