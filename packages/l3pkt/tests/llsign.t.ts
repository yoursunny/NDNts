import * as crypto from "crypto";
import delay from "delay";

import { Name } from "@ndn/name";
import { Decodable, Decoder, Encodable, Encoder } from "@ndn/tlv";
import { Data, LLSign, LLVerify } from "../src";

class TestAlgo {
  constructor(private key: string, private wantSignError: boolean = false) {
  }

  public sign = async (input: Uint8Array): Promise<Uint8Array> => {
    await delay(10);
    if (this.wantSignError) {
      throw new Error("mock-signing-error");
    }
    return this.computeSignature(input);
  }

  public verify = async (input: Uint8Array, sig: Uint8Array): Promise<void> => {
    await delay(10);
    // warning: this is insecure comparison, for test case only
    if (Buffer.compare(sig, this.computeSignature(input)) !== 0) {
      throw LLVerify.BAD_SIG;
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
  await expect(LLVerify.call(ALGO0.verify, obj)).rejects.toThrow(/empty/);

  await expect(LLSign.call(ALGO1.sign, obj)).rejects.toThrow(/mock-signing-error/);

  await expect(LLSign.call(ALGO0.sign, obj)).resolves.toBeUndefined();
  await expect(LLVerify.call(ALGO0.verify, obj)).resolves.toBeUndefined();

  await expect(LLVerify.call(ALGO1.verify, obj)).rejects.toThrow(/incorrect/);
});

test.each(TABLE)("verify %#", async ({ cls }) => {
  const obj = new cls(new Name("/A"));
  await LLSign.call(ALGO0.sign, obj);
  const decoded = new Decoder(Encoder.encode(obj)).decode(cls);
  await expect(LLVerify.call(ALGO0.verify, decoded)).resolves.toBeUndefined();
});
