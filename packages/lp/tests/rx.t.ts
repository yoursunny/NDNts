import { Decoder } from "@ndn/tlv";
import "@ndn/tlv/test-fixture";
import { collect, map, pipeline } from "streaming-iterables";

import { LpService } from "../src";

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
    new Uint8Array([ // LP packet with decoding error, drop
      0x64, 0x0E,
      0x81, 0x08, 0xA0, 0xA1, 0xA2, 0xA3, 0xA4, 0xA5, 0xA6, 0xA7, // FragSeqNum unrecognized critical
      0x50, 0x02, 0xC2, 0x00,
    ]),
  ];

  const output: Decoder.Tlv[] = await pipeline(
    function*() { yield* input; },
    map((buf: Uint8Array) => new Decoder(buf).read()),
    new LpService().rx,
    collect,
  );

  expect(output).toHaveLength(2);
  expect(output[0].tlv).toEqualUint8Array([0xC0, 0x00]);
  expect(output[1].tlv).toEqualUint8Array([0xC1, 0x00]);
});
