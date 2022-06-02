import "@ndn/packet/test-fixture/expect";

import { Data, digestSigning, Interest, Nack, NackReason, TT as l3TT } from "@ndn/packet";
import { Decoder, Encoder } from "@ndn/tlv";
import { delay } from "@ndn/util";
import { collect, filter, map, pipeline, tap } from "streaming-iterables";
import { expect, test } from "vitest";

import { LpService, TT } from "..";

test("rx", async () => {
  const input = [
    Uint8Array.of( // LP packet successfully decoded, deliver payload only
      0x64, 0x22,
      0x62, 0x04, 0xD0, 0xD1, 0xD2, 0xD3, // PitToken
      0xFD, 0x03, 0x48, 0x08, 0xA0, 0xA1, 0xA2, 0xA3, 0xA4, 0xA5, 0xA6, 0xA7, // TxSeqNum ignored
      0x50, 0x0E, // LpPayload
      0x06, 0x0C, // Data
      0x07, 0x03, 0x08, 0x01, 0x44, // Name
      0x16, 0x03, 0x1B, 0x01, 0x00, // DSigInfo
      0x17, 0x00, // DSigValue
    ),
    Uint8Array.of( // LP packet without payload, skip
      0x64, 0x0C,
      0xFD, 0x03, 0x44, 0x08, 0xA0, 0xA1, 0xA2, 0xA3, 0xA4, 0xA5, 0xA6, 0xA7, // Ack ignored
    ),
    Encoder.encode(new Interest("/I")), // non LP packet, pass through
    Uint8Array.of( // LP packet with decoding error, error
      0x64, 0x06,
      0x63, 0x00, // 0x63 unrecognized critical
      0x50, 0x02, 0xC2, 0x00,
    ),
    Uint8Array.of( // Nack, deliver
      0x64, 0x18,
      0xFD, 0x03, 0x20, 0x05, 0xFD, 0x03, 0x21, 0x01, 0x64, // Nack~Duplicate
      0x50, 0x0D, // LpPayload
      0x05, 0x0B, // Interest
      0x07, 0x03, 0x08, 0x01, 0x4E, // Name
      0x0A, 0x04, 0xA0, 0xA1, 0xA2, 0xA3, // Nonce
    ),
    Uint8Array.of( // NackHeader with Data, error
      0x64, 0x14,
      0xFD, 0x03, 0x20, 0x00, // Nack
      0x50, 0x0E, // LpPayload
      0x06, 0x0C, // Data
      0x07, 0x03, 0x08, 0x01, 0x4E, // Name
      0x16, 0x03, 0x1B, 0x01, 0x00, // DSigInfo
      0x17, 0x00, // DSigValue
    ),
  ];

  const output = await pipeline(
    function*() { yield* input; },
    map((buf: Uint8Array) => new Decoder(buf).read()),
    new LpService({}, { mtu: Infinity }).rx,
    collect,
  );

  expect(output).toHaveLength(5);
  expect(output[0]).not.toBeInstanceOf(LpService.RxError);
  const output0 = output[0] as LpService.Packet;
  expect(output0.l3).toBeInstanceOf(Data);
  expect(output0.l3).toHaveName("/D");
  expect(output0.token).toEqualUint8Array([0xD0, 0xD1, 0xD2, 0xD3]);
  expect(output[1]).not.toBeInstanceOf(LpService.RxError);
  const output1 = output[1] as LpService.Packet;
  expect(output1.l3).toBeInstanceOf(Interest);
  expect(output1.l3).toHaveName("/I");
  expect(output1.token).toBeUndefined();
  expect(output[2]).toBeInstanceOf(LpService.RxError);
  expect(output[3]).not.toBeInstanceOf(LpService.RxError);
  const output3 = output[3] as LpService.Packet;
  expect(output3.l3).toBeInstanceOf(Nack);
  const nack3 = output3.l3 as Nack;
  expect(nack3.interest).toHaveName("/N");
  expect(nack3.reason).toBe(NackReason.Duplicate);
  expect(output[4]).toBeInstanceOf(LpService.RxError);
});

test("tx", async () => {
  async function* input(): AsyncIterable<LpService.Packet> {
    await delay(10);
    const pkt0 = new Data("/D");
    await digestSigning.sign(pkt0);
    yield { l3: pkt0 };

    await delay(10);
    const pkt1 = new Interest("/I");
    yield { l3: pkt1 };

    await delay(10);
    const pkt2 = new Nack(new Interest("/N", Interest.Nonce(0xA0A1A2A3)));
    yield { l3: pkt2 };

    // pkt3 IDLE

    await delay(200);
    const pkt4 = new Interest("/P");
    yield { l3: pkt4, token: Uint8Array.of(0xD4, 0xD5) };
  }

  const output = await pipeline(
    input,
    new LpService({ keepAlive: 130 }, { mtu: Infinity }).tx,
    collect,
  );

  expect(output).toHaveLength(5);
  expect(output[0]).toMatchTlv(({ type }) => expect(type).toBe(l3TT.Data));
  expect(output[1]).toMatchTlv(({ type }) => expect(type).toBe(l3TT.Interest));
  expect(output[2]).toMatchTlv(({ type, value }) => {
    expect(type).toBe(TT.LpPacket);
    expect(value).toMatchTlv(
      ({ type, value }) => {
        expect(type).toBe(TT.Nack);
        expect(value).toMatchTlv(({ type, nni }) => {
          expect(type).toBe(TT.NackReason);
          expect(nni).toBe(NackReason.NoRoute);
        });
      },
      ({ type, value }) => {
        expect(type).toBe(TT.LpPayload);
        expect(value).toMatchTlv(({ type }) => expect(type).toBe(l3TT.Interest));
      },
    );
  });
  expect(output[3]).toEqualUint8Array([0x64, 0x00]);
  expect(output[4]).toMatchTlv(({ type, value }) => {
    expect(type).toBe(TT.LpPacket);
    expect(value).toMatchTlv(
      ({ type, length, value }) => {
        expect(type).toBe(TT.PitToken);
        expect(length).toBe(2);
        expect(value).toEqualUint8Array([0xD4, 0xD5]);
      },
      ({ type }) => {
        expect(type).toBe(TT.LpPayload);
      },
    );
  });
});

test("fragmentation", async () => {
  async function* input(): AsyncIterable<LpService.Packet> {
    for (let i = 0; i < 50; ++i) {
      await delay(10);
      const pkt = new Data(`/${i}`);
      pkt.content = new Uint8Array(3000);
      pkt.content.fill(i);
      await digestSigning.sign(pkt);
      yield { l3: pkt, token: Uint8Array.of(0xFF, i) };
    }
  }

  const fragments: Uint8Array[] = [];
  const output = await pipeline(
    input,
    new LpService({ mtu: 1200 }, { mtu: Infinity }).tx,
    filter((item): item is Uint8Array => item instanceof Uint8Array),
    tap((fragment) => fragments.push(fragment)),
    map((buf: Uint8Array) => new Decoder(buf).read()),
    new LpService({ reassemblerCapacity: 2 }, { mtu: Infinity }).rx,
    filter((item: any): item is LpService.Packet => !!item.l3),
    collect,
  );

  expect(output).toHaveLength(50);
  expect(fragments).toHaveLength(150);
});
