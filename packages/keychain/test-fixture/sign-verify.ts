import { Data, Interest, LLSign, LLVerify, SigInfo } from "@ndn/l3pkt";
import { Decoder, Encoder } from "@ndn/tlv";

import { PrivateKey, PublicKey } from "../src";

type Packet = Interest | Data;
type PacketCtor = typeof Interest | typeof Data;

export interface Row {
  cls: PacketCtor;
}

export const TABLE: Row[] = [
  { cls: Interest },
  { cls: Data },
];

interface SignRecord {
  wire: Uint8Array;
  signed: Uint8Array;
  sigInfo: SigInfo;
  sigValue: Uint8Array;
}

interface VerifyRecord {
  matched: boolean;
  verified: boolean;
}

export interface TestRecord {
  sA0: SignRecord; // sign with pvtA
  sA1: SignRecord; // sign with pvtA again
  sB0: SignRecord; // sign with pvtB
  sB1: SignRecord; // sign with pvtB again
  vAA: VerifyRecord; // verify pktA with pubA
  vAB: VerifyRecord; // verify pktA with pubB
  vBA: VerifyRecord; // verify pktB with pubA
  vBB: VerifyRecord; // verify pktB with pubB
  vMi: VerifyRecord; // verify mutated pktA (inserted byte) with pubA
  vMd: VerifyRecord; // verify mutated pktA (deleted byte) with pubA
  vMc: VerifyRecord; // verify mutated pktA (changed bit) with pubA
}

async function sign(cls: PacketCtor, pvt: PrivateKey): Promise<[Packet, SignRecord]> {
  const src = new cls("/NAME");
  pvt.sign(src);
  await src[LLSign.PROCESS]();
  const wire = Encoder.encode(src);
  const pkt = cls.decodeFrom(new Decoder(wire));
  if (!pkt[LLVerify.SIGNED]) { throw new Error("[SIGNED] is missing"); }
  if (!pkt.sigInfo) { throw new Error("sigInfo is missing"); }
  if (!pkt.sigValue) { throw new Error("sigValue is missing"); }
  return [pkt, {
    wire,
    signed: pkt[LLVerify.SIGNED]!,
    sigInfo: pkt.sigInfo,
    sigValue: pkt.sigValue,
  }];
}

async function verify(pkt: Packet, pub: PublicKey): Promise<VerifyRecord> {
  const matched = pub.match(pkt);
  let verified: boolean;
  try {
    await pub.verify(pkt);
    verified = true;
  } catch {
    verified = false;
  }
  return { matched, verified };
}

export async function execute(cls: PacketCtor, pvtA: PrivateKey, pubA: PublicKey,
                              pvtB: PrivateKey, pubB: PublicKey): Promise<TestRecord> {
  const [pktA, sA0] = await sign(cls, pvtA);
  const [pktB, sB0] = await sign(cls, pvtB);

  const pktMi = cls.decodeFrom(new Decoder(sA0.wire));
  pktMi.sigValue = (() => {
    const sig = new Uint8Array(pktMi.sigValue!.byteLength + 1);
    sig.set(pktMi.sigValue!, 0);
    const offset = 1 + Math.floor(Math.random() * sig.byteLength - 2);
    sig.copyWithin(offset + 1, offset);
    sig[offset] = 0xBB;
    return sig;
  })();

  const pktMd = cls.decodeFrom(new Decoder(sA0.wire));
  pktMd.sigValue = (() => {
    const sig = Uint8Array.from(pktMd.sigValue!);
    const offset = Math.floor(Math.random() * (sig.byteLength - 1));
    sig.copyWithin(offset, offset + 1);
    return sig.subarray(0, -1);
  })();

  const pktMc = cls.decodeFrom(new Decoder(sA0.wire));
  pktMc.sigValue = (() => {
    const sig = Uint8Array.from(pktMc.sigValue!);
    const offset = Math.floor(Math.random() * sig.byteLength);
    // tslint:disable-next-line:no-bitwise
    sig[offset] ^= 0x01;
    return sig;
  })();

  return {
    sA0,
    sA1: (await sign(cls, pvtA))[1],
    sB0,
    sB1: (await sign(cls, pvtB))[1],
    vAA: await verify(pktA, pubA),
    vAB: await verify(pktA, pubB),
    vBA: await verify(pktB, pubA),
    vBB: await verify(pktB, pubB),
    vMi: await verify(pktMi, pubA),
    vMd: await verify(pktMd, pubA),
    vMc: await verify(pktMc, pubA),
  } as TestRecord;
}

export function check(record: TestRecord, isDeterministic: boolean = false, sameAB: boolean = false) {
  // If signing algorithm is deterministic, both signatures should be the same.
  // Otherwise, they should be different.
  expect(!Buffer.compare(record.sA0.sigValue, record.sA1.sigValue)).toBe(isDeterministic);
  expect(!Buffer.compare(record.sB0.sigValue, record.sB1.sigValue)).toBe(isDeterministic);

  // If A and B are different keys, their signatures should be different.
  if (!sameAB) {
    expect(!Buffer.compare(record.sA0.sigValue, record.sB0.sigValue)).toBeFalsy();
  }

  // Verification using counterpart of the signing key should succeed.
  expect(record.vAA.matched).toBeTruthy();
  expect(record.vAA.verified).toBeTruthy();
  expect(record.vBB.matched).toBeTruthy();
  expect(record.vBB.verified).toBeTruthy();

  // Verification using a different key should fail, unless A and B are the same (i.e. theDigestKey).
  expect(record.vAB.matched).toBe(sameAB);
  expect(record.vAB.verified).toBe(sameAB);
  expect(record.vBA.matched).toBe(sameAB);
  expect(record.vBA.verified).toBe(sameAB);

  // Verification on a mutated signature should fail.
  expect(record.vMi.matched).toBe(true);
  expect(record.vMi.verified).toBe(false);
  expect(record.vMd.matched).toBe(true);
  expect(record.vMd.verified).toBe(false);
  expect(record.vMc.matched).toBe(true);
  expect(record.vMc.verified).toBe(false);

  // Caller is responsible for checking SigInfo.
}
