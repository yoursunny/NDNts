import "@ndn/tlv/test-fixture/expect";

import { createHmac } from "node:crypto";

import { type Decodable, Decoder, type Encodable, Encoder } from "@ndn/tlv";
import { delay } from "@ndn/util";
import { expect, test } from "vitest";

import { Data, digestSigning, Interest, LLSign, LLVerify, Name, nullSigner, SigInfo, Signer, SigType, TT } from "..";
import * as TestSignVerify from "../test-fixture/sign-verify";

class TestAlgo {
  constructor(private readonly key: string, private readonly wantSignError = false) {}

  public sign(pkt: LLSign.Signable) {
    return pkt[LLSign.OP](async (input) => {
      await delay(5);
      if (this.wantSignError) {
        throw new Error("mock-signing-error");
      }
      return this.computeSignature(input);
    });
  }

  public verify(pkt: LLVerify.Verifiable) {
    return pkt[LLVerify.OP](async (input, sig) => {
      await delay(5);
      // warning: this is insecure comparison, for test case only
      if (Buffer.compare(sig, this.computeSignature(input)) !== 0) {
        throw new Error("incorrect signature value");
      }
    });
  }

  private computeSignature(input: Uint8Array): Uint8Array {
    // warning: this is insecure hashing algorithm, for test case only
    const hash = createHmac("sha256", this.key);
    hash.update(input);
    return hash.digest();
  }
}

const ALGO0 = new TestAlgo("0");
const ALGO1 = new TestAlgo("1", true);

type Pkt = LLSign.Signable & LLVerify.Verifiable & Encodable & { sigInfo: SigInfo };

interface Row {
  pkt: string;
  Packet: (new(name: Name) => Pkt) & Decodable<Pkt>;
  checkWire: (tlv: Decoder.Tlv) => void;
}

const TABLE = [
  {
    pkt: "Interest",
    Packet: Interest,
    checkWire({ type, value }) {
      expect(type).toBe(TT.Interest);
      expect(value).toMatchTlv(
        ({ type, value }) => {
          expect(type).toBe(TT.Name);
          expect(value).toMatchTlv(
            ({ type }) => expect(type).toBe(TT.GenericNameComponent),
            ({ type, length }) => {
              expect(type).toBe(TT.ParametersSha256DigestComponent);
              expect(length).toBe(32);
            },
          );
        },
        ({ type }) => expect(type).toBe(TT.Nonce),
        ({ type, length }) => {
          expect(type).toBe(TT.AppParameters);
          expect(length).toBe(0);
        },
        ({ type }) => expect(type).toBe(TT.ISigInfo),
        ({ type, length }) => {
          expect(type).toBe(TT.ISigValue);
          expect(length).toBe(32);
        },
      );
    },
  },
  {
    pkt: "Data",
    Packet: Data,
    checkWire({ type, value }) {
      expect(type).toBe(TT.Data);
      expect(value).toMatchTlv(
        ({ decoder }) => expect(decoder.decode(Name)).toHaveLength(1),
        ({ type }) => expect(type).toBe(TT.DSigInfo),
        ({ type, length }) => {
          expect(type).toBe(TT.DSigValue);
          expect(length).toBe(32);
        },
      );
    },
  },
] as Row[];

test.each(TABLE)("sign $pkt", async ({ Packet }) => {
  const pkt = new Packet(new Name("/A"));
  pkt.sigInfo = new SigInfo(SigType.HmacWithSha256, Uint8Array.of(0xA0, 0xA1));
  await expect(ALGO1.sign(pkt)).rejects.toThrow(/mock-signing-error/);

  await ALGO0.sign(pkt);
  expect(() => Encoder.encode(pkt)).not.toThrow();
});

test.each(TABLE)("verify $pkt", async ({ Packet, checkWire }) => {
  const src = new Packet(new Name("/A"));
  src.sigInfo = new SigInfo(SigType.Sha256);
  await ALGO0.sign(src);
  const wire = Encoder.encode(src);
  expect(wire).toMatchTlv(checkWire);

  await ALGO0.verify(src);
  await expect(ALGO1.verify(src)).rejects.toThrow(/incorrect/);

  const obj = Decoder.decode(wire, Packet);
  await ALGO0.verify(obj);
  await expect(ALGO1.verify(obj)).rejects.toThrow(/incorrect/);
});

test("digestSigning simple", async () => {
  const data = new Data("/D");
  await digestSigning.sign(data);
  expect(data.sigInfo.type).toBe(SigType.Sha256);
  await digestSigning.verify(data);

  data.sigInfo.type = SigType.HmacWithSha256;
  await expect(digestSigning.verify(data)).rejects.toThrow();
  data.sigInfo.type = SigType.Sha256;

  data.sigValue = data.sigValue.slice(1);
  await expect(digestSigning.verify(data)).rejects.toThrow();
});

test.each(TestSignVerify.PacketTable)("digestSigning $PacketType", async ({ Packet }) => {
  const record = await TestSignVerify.execute(Packet, digestSigning, digestSigning, digestSigning, digestSigning);
  TestSignVerify.check(record, { deterministic: true, sameAB: true });
});

test("nullSigner", async () => {
  const data = new Data("/D");
  expect(data.sigInfo.type).toBe(SigType.Null);
  expect(data.sigValue).toHaveLength(0);

  await digestSigning.sign(data);
  expect(data.sigInfo.type).not.toBe(SigType.Null);
  expect(data.sigValue).not.toHaveLength(0);

  await nullSigner.sign(data);
  expect(data.sigInfo.type).toBe(SigType.Null);
  expect(data.sigValue).toHaveLength(0);

  const interest = new Interest("/I");
  expect(interest.sigInfo).toBeUndefined();
  expect(interest.sigValue).toHaveLength(0);

  await nullSigner.sign(interest);
  expect(interest.sigInfo?.type).toBe(SigType.Null);
  expect(interest.sigValue).toHaveLength(0);
  await expect(interest.validateParamsDigest()).resolves.toBeUndefined();

  const parameterized = new Interest("/I/P");
  parameterized.appParameters = Uint8Array.of(0xA0, 0xA1);

  await nullSigner.sign(parameterized);
  expect(parameterized.sigInfo?.type).toBe(SigType.Null);
  expect(parameterized.sigValue).toHaveLength(0);
  await expect(parameterized.validateParamsDigest()).resolves.toBeUndefined();
});

test("onlyIfUnsigned", async () => {
  const digestIfUnsigned = Signer.onlyIfUnsigned(digestSigning);

  const interest = new Interest("/I");
  expect(interest.sigInfo).toBeUndefined();
  await digestIfUnsigned.sign(interest);
  expect(interest.sigInfo?.type).toBe(SigType.Sha256);

  const data = new Data("/D");
  expect(data.sigInfo.type).toBe(SigType.Null);
  await digestIfUnsigned.sign(data);
  expect(data.sigInfo.type).toBe(SigType.Sha256);

  Signer.putSigInfo(data, SigType.HmacWithSha256, "/K");
  expect(data.sigInfo?.type).toBe(SigType.HmacWithSha256);
  await digestIfUnsigned.sign(data);
  expect(data.sigInfo?.type).toBe(SigType.HmacWithSha256);
});
