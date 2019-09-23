import * as crypto from "crypto";
import delay from "delay";

import { Name } from "@ndn/name";
import { Decodable, Decoder, Encodable, Encoder } from "@ndn/tlv";
import { Data, LLSign, LLVerify } from "../src";

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
    const hash = crypto.createHmac("sha1", this.key);
    hash.update(input);
    return hash.digest();
  }
}

const ALGO0 = new TestAlgo("0");
const ALGO1 = new TestAlgo("1", true);

type Pkt = LLSign.Signable & LLVerify.Verifiable & Encodable;

interface Row {
  cls: (new(name?: Name) => Pkt) & Decodable<Pkt>;
}

const TABLE = [
  { cls: Data },
] as Row[];

test.each(TABLE)("sign %#", async ({ cls }) => {
  const obj = new cls();
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

test.each(TABLE)("verify %#", async ({ cls }) => {
  const src = new cls(new Name("/A"));
  src[LLSign.PENDING] = ALGO0.sign;
  await src[LLSign.PROCESS]();

  const obj = new Decoder(Encoder.encode(src)).decode(cls);
  expect(obj[LLVerify.SIGNED]).not.toBeUndefined();
  await expect(obj[LLVerify.VERIFY](ALGO0.verify)).resolves.toBeUndefined();
  await expect(obj[LLVerify.VERIFY](ALGO1.verify)).rejects.toThrow(/incorrect/);

  const empty = new cls(); // no signed portion
  await expect(empty[LLVerify.VERIFY](ALGO0.verify)).rejects.toThrow(/empty/);
});
