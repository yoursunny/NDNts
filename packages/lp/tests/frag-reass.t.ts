import "@ndn/util/test-fixture/expect";

import { Encoder } from "@ndn/tlv";

import { Fragmenter, LpPacket, Reassembler } from "..";

test("fragment single", () => {
  const lpp = new LpPacket();
  lpp.payload = new Uint8Array(256);

  const f = new Fragmenter();
  const frags = f.fragment(lpp, 1200);
  expect(frags).toHaveLength(1);
  expect(frags[0]!.payload).toEqualUint8Array(lpp.payload);
});

test("fragment multi", () => {
  const lpp = new LpPacket();
  lpp.pitToken = Uint8Array.of(0xA0, 0xA1, 0xA2, 0xA3);
  lpp.payload = new Uint8Array(2000);

  const MTU = 1200;
  const f = new Fragmenter();
  const frags = f.fragment(lpp, MTU);
  expect(frags).toHaveLength(2);
  expect(Encoder.encode(frags[0]).length).toBeLessThanOrEqual(MTU);
  expect(frags[0]!.pitToken).toEqualUint8Array(lpp.pitToken);
  expect(Encoder.encode(frags[1]).length).toBeLessThanOrEqual(MTU);
  expect(frags[1]!.pitToken).toBeUndefined();
  expect(frags[0]!.payload!.length + frags[1]!.payload!.length).toEqual(lpp.payload.length);
});

test("fragment small MTU", () => {
  const lpp = new LpPacket();
  lpp.pitToken = Uint8Array.of(0xA0, 0xA1, 0xA2, 0xA3, 0xA4, 0xA5);

  const f = new Fragmenter();
  const frags = f.fragment(lpp, 8);
  expect(frags).toHaveLength(0);
});

test("reass single", () => {
  const frag0 = new LpPacket();
  frag0.payload = new Uint8Array(512);

  const r = new Reassembler(1);
  const lpp = r.accept(frag0);
  expect(lpp).toBe(frag0);
});

test("reass bad", () => {
  const frag0 = new LpPacket();
  frag0.fragSeqNum = undefined;
  frag0.fragCount = 2;

  const frag1 = new LpPacket();
  frag1.fragSeqNum = 0x1000n;
  frag1.fragIndex = 2;
  frag1.fragCount = 2;

  const r = new Reassembler(2);
  expect(r.accept(frag0)).toBeUndefined();
  expect(r.accept(frag1)).toBeUndefined();
});

test("reass reorder", () => {
  const frag0 = new LpPacket();
  frag0.fragSeqNum = 0xFFFFFFFFFFFFFFFFn;
  frag0.fragIndex = 0;
  frag0.fragCount = 3;
  frag0.payload = new Uint8Array(400);
  frag0.payload[0] = 0xC0;
  frag0.payload[399] = 0xD0;

  const frag1 = new LpPacket();
  frag1.fragSeqNum = 0x0000000000000000n;
  frag1.fragIndex = 1;
  frag1.fragCount = 3;
  frag1.payload = new Uint8Array(200);
  frag1.payload[0] = 0xC1;
  frag1.payload[199] = 0xD1;

  const frag2 = new LpPacket();
  frag2.fragSeqNum = 0x0000000000000001n;
  frag2.fragIndex = 2;
  frag2.fragCount = 3;
  frag2.payload = new Uint8Array(100);
  frag2.payload[0] = 0xC2;
  frag2.payload[99] = 0xD2;

  const r = new Reassembler(1);
  expect(r.accept(frag1)).toBeUndefined();
  expect(r.accept(frag0)).toBeUndefined();
  expect(r.accept(frag0)).toBeUndefined(); // duplicate receipt
  const lpp = r.accept(frag2);
  expect(lpp).toBeInstanceOf(LpPacket);

  const { payload } = lpp!;
  expect(payload).toHaveLength(700);
  expect(payload!.subarray(399, 401)).toEqualUint8Array([0xD0, 0xC1]);
  expect(payload!.subarray(599, 601)).toEqualUint8Array([0xD1, 0xC2]);
});

test("reass inconsistent FragCount", () => {
  const frag0 = new LpPacket();
  frag0.fragSeqNum = 0x1000n;
  frag0.fragIndex = 0;
  frag0.fragCount = 2;
  frag0.payload = new Uint8Array(400);

  const frag1 = new LpPacket();
  frag1.fragSeqNum = 0x1001n;
  frag1.fragIndex = 1;
  frag1.fragCount = 2;
  frag1.payload = new Uint8Array(200);

  const frag2 = new LpPacket();
  frag2.fragSeqNum = 0x1002n;
  frag2.fragIndex = 2;
  frag2.fragCount = 3;
  frag2.payload = new Uint8Array(100);

  const r = new Reassembler(1);
  expect(r.accept(frag0)).toBeUndefined();
  expect(r.accept(frag2)).toBeUndefined(); // discards frag0 due to different FragCount
  expect(r.accept(frag1)).toBeUndefined();
});

test("reass evict", () => {
  const makeFragments = (seqNum: bigint): [LpPacket, LpPacket] => {
    const frag0 = new LpPacket();
    frag0.fragSeqNum = seqNum;
    frag0.fragIndex = 0;
    frag0.fragCount = 2;
    frag0.payload = new Uint8Array(200);

    const frag1 = new LpPacket();
    frag1.fragSeqNum = seqNum + 1n;
    frag1.fragIndex = 1;
    frag1.fragCount = 2;
    frag1.payload = new Uint8Array(100);

    return [frag0, frag1];
  };

  const [fragA0, fragA1] = makeFragments(0x1000n);
  const [fragB0, fragB1] = makeFragments(0x2000n);
  const [fragC0, fragC1] = makeFragments(0x3000n);

  const r = new Reassembler(2);
  expect(r.accept(fragA0)).toBeUndefined(); // [A]
  expect(r.accept(fragB1)).toBeUndefined(); // [A, B]
  expect(r.accept(fragC0)).toBeUndefined(); // [B, C]; evicts A0
  expect(r.accept(fragC1)).toBeInstanceOf(LpPacket); // [B]
  expect(r.accept(fragA1)).toBeUndefined(); // [B, A]
  expect(r.accept(fragB0)).toBeInstanceOf(LpPacket); // [A]
});
