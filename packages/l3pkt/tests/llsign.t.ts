import * as crypto from "crypto";
import delay from "delay";

import { Name } from "@ndn/name";
import { Decodable, Decoder, Encodable, Encoder } from "@ndn/tlv";
import "@ndn/tlv/test-fixture";

import { Data, DSigInfo, Interest, ISigInfo, KeyDigest, LLSign, LLVerify, SigInfo, SigType, TT } from "../src";

class TestAlgo {
  constructor(private key: string, private wantSignError: boolean = false) {
  }

  public sign = async (input: Uint8Array): Promise<Uint8Array> => {
    await delay(5);
    if (this.wantSignError) {
      throw new Error("mock-signing-error");
    }
    return this.computeSignature(input);
  }

  public verify = async (input: Uint8Array, sig: Uint8Array): Promise<void> => {
    await delay(5);
    // warning: this is insecure comparison, for test case only
    if (Buffer.compare(sig, this.computeSignature(input)) !== 0) {
      throw new Error("incorrect signature value");
    }
  }

  private computeSignature(input: Uint8Array): Uint8Array {
    // warning: this is insecure hashing algorithm, for test case only
    const hash = crypto.createHmac("sha256", this.key);
    hash.update(input);
    return hash.digest();
  }
}

const ALGO0 = new TestAlgo("0");
const ALGO1 = new TestAlgo("1", true);

function makeSigInfo<T extends SigInfo>(cls: (new() => T)): T {
  const sigInfo = new cls();
  sigInfo.type = SigType.HmacWithSha256;
  sigInfo.keyLocator = new KeyDigest(new Uint8Array([0xA0, 0xA1]));
  return sigInfo;
}

type Pkt = LLSign.Signable & LLVerify.Verifiable & Encodable & {sigInfo: SigInfo};

interface Row {
  cls: (new(name: Name) => Pkt) & Decodable<Pkt>;
  si: SigInfo;
  checkWire(tlv: Decoder.Tlv);
}

const TABLE = [
  {
    cls: Interest,
    si: makeSigInfo(ISigInfo),
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
    cls: Data,
    si: makeSigInfo(DSigInfo),
    checkWire({ type, value }) {
      expect(type).toBe(TT.Data);
      expect(value).toMatchTlv(
        ({ decoder }) => expect(decoder.decode(Name).size).toBe(1),
        ({ type }) => expect(type).toBe(TT.DSigInfo),
        ({ type, length }) => {
          expect(type).toBe(TT.DSigValue);
          expect(length).toBe(32);
        },
      );
    },
  },
] as Row[];

test.each(TABLE)("sign %#", async ({ cls, si }) => {
  const obj = new cls(new Name("/A"));
  obj.sigInfo = si;
  await expect(obj[LLSign.PROCESS]()).resolves.toBeUndefined(); // noop

  obj[LLSign.PENDING] = ALGO1.sign;
  expect(() => Encoder.encode(obj)).toThrow(/pending/);
  await expect(obj[LLSign.PROCESS]()).rejects.toThrow(/mock-signing-error/);
  expect(obj[LLSign.PENDING]).not.toBeUndefined();

  obj[LLSign.PENDING] = ALGO0.sign;
  await expect(obj[LLSign.PROCESS]()).resolves.toBeUndefined();
  expect(obj[LLSign.PENDING]).toBeUndefined();
  expect(Encoder.encode(obj)).not.toBeUndefined();
});

test.each(TABLE)("verify %#", async ({ cls, si, checkWire }) => {
  const src = new cls(new Name("/A"));
  src.sigInfo = si;
  src[LLSign.PENDING] = ALGO0.sign;
  await src[LLSign.PROCESS]();
  const wire = Encoder.encode(src);
  expect(wire).toMatchTlv(checkWire);

  const obj = new Decoder(wire).decode(cls);
  expect(obj[LLVerify.SIGNED]).not.toBeUndefined();
  await expect(obj[LLVerify.VERIFY](ALGO0.verify)).resolves.toBeUndefined();
  await expect(obj[LLVerify.VERIFY](ALGO1.verify)).rejects.toThrow(/incorrect/);

  obj[LLVerify.SIGNED] = undefined;
  await expect(obj[LLVerify.VERIFY](ALGO0.verify)).rejects.toThrow(/empty/);
});
