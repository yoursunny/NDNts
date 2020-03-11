import { theDigestKey } from "@ndn/keychain";
import { Data, Interest, Nack, NackReason, TT as l3TT } from "@ndn/packet";
import "@ndn/packet/test-fixture/expect";
import { Decoder, Encoder } from "@ndn/tlv";
import { collect, map, pipeline } from "streaming-iterables";

import { LpService, TT } from "..";

test("rx", async () => {
  const input = [
    Uint8Array.of( // LP packet successfully decoded, deliver payload only
      0x64, 0x19,
      0xFD, 0x03, 0x48, 0x08, 0xA0, 0xA1, 0xA2, 0xA3, 0xA4, 0xA5, 0xA6, 0xA7, // TxSeqNum ignored
      0x50, 0x0B, // Fragment
      0x06, 0x09, // Data
      0x07, 0x03, 0x08, 0x01, 0x44, // Name
      0x16, 0x00, // DSigInfo
      0x17, 0x00, // DSigValue
    ),
    Uint8Array.of( // LP packet without payload, skip
      0x64, 0x0C,
      0xFD, 0x03, 0x44, 0x08, 0xA0, 0xA1, 0xA2, 0xA3, 0xA4, 0xA5, 0xA6, 0xA7, // Ack ignored
    ),
    Encoder.encode(new Interest("/I")), // non LP packet, pass through
    Uint8Array.of( // LP packet with decoding error, error
      0x64, 0x0E,
      0x81, 0x08, 0xA0, 0xA1, 0xA2, 0xA3, 0xA4, 0xA5, 0xA6, 0xA7, // FragSeqNum unrecognized critical
      0x50, 0x02, 0xC2, 0x00,
    ),
    Uint8Array.of( // Nack, deliver
      0x64, 0x18,
      0xFD, 0x03, 0x20, 0x05, 0xFD, 0x03, 0x21, 0x01, 0x64, // Nack~Duplicate
      0x50, 0x0D, // Fragment
      0x05, 0x0B, // Interest
      0x07, 0x03, 0x08, 0x01, 0x4E, // Name
      0x0A, 0x04, 0xA0, 0xA1, 0xA2, 0xA3, // Nonce
    ),
    Uint8Array.of( // NackHeader with Data, error
      0x64, 0x11,
      0xFD, 0x03, 0x20, 0x00, // Nack
      0x50, 0x0B, // Fragment
      0x06, 0x09, // Data
      0x07, 0x03, 0x08, 0x01, 0x4E, // Name
      0x16, 0x00, // DSigInfo
      0x17, 0x00, // DSigValue
    ),
  ];

  const output = await pipeline(
    function*() { yield* input; },
    map((buf: Uint8Array) => new Decoder(buf).read()),
    new LpService().rx,
    collect,
  );

  expect(output).toHaveLength(5);
  expect(output[0]).toBeInstanceOf(Data);
  expect(output[0]).toHaveName("/D");
  expect(output[1]).toBeInstanceOf(Interest);
  expect(output[1]).toHaveName("/I");
  expect(output[2]).toBeInstanceOf(LpService.RxError);
  expect(output[3]).toBeInstanceOf(Nack);
  expect((output[3] as Nack).interest).toHaveName("/N");
  expect((output[3] as Nack).reason).toBe(NackReason.Duplicate);
  expect(output[4]).toBeInstanceOf(LpService.RxError);
});

test("tx", async () => {
  const input = [
    new Data("/D"),
    new Interest("/I"),
    new Nack(new Interest("/N", Interest.Nonce(0xA0A1A2A3))),
  ];
  theDigestKey.sign(input[0] as Data);

  const output = await pipeline(
    async function*() { yield* input; },
    new LpService().tx,
    collect,
  );

  expect(output).toHaveLength(3);
  expect(output[0]).toMatchTlv(({ type }) => expect(type).toBe(l3TT.Data));
  expect(output[1]).toMatchTlv(({ type }) => expect(type).toBe(l3TT.Interest));
  expect(output[2]).toMatchTlv(({ type, value }) => {
    expect(type).toBe(TT.LpPacket);
    expect(value).toMatchTlv(
      ({ type, value }) => {
        expect(type).toBe(l3TT.Nack);
        expect(value).toMatchTlv(({ type, nni }) => {
          expect(type).toBe(l3TT.NackReason);
          expect(nni).toBe(NackReason.NoRoute);
        });
      },
      ({ type, value }) => {
        expect(type).toBe(TT.Fragment);
        expect(value).toMatchTlv(({ type }) => expect(type).toBe(l3TT.Interest));
      },
    );
  });
});
