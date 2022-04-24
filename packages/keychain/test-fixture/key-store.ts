import { Name, SigType } from "@ndn/packet";
import { expect } from "vitest";

import { type NamedSigner, type NamedVerifier, ECDSA, generateSigningKey, HMAC, KeyChain, RSA } from "..";

interface Options {
  skipHmac?: boolean;
}

export interface TestRecord {
  keys0: string[];
  keys1: string[];
  keys2: string[];
  keys3: string[];
  keys4: string[];
}

export async function execute(
    keyChain: KeyChain,
    { skipHmac = false }: Options = {},
): Promise<TestRecord> {
  const keys0 = (await keyChain.listKeys()).map(String);

  const gen = await Promise.all(Array.from((function*(): Generator<Promise<[NamedSigner, NamedVerifier]>> {
    for (let i = 0; i < 16; ++i) {
      yield generateSigningKey(keyChain, `/${i}`, ECDSA);
    }
    for (let i = 16; i < 32; ++i) {
      yield generateSigningKey(keyChain, `/${i}`, RSA);
    }
    if (!skipHmac) {
      for (let i = 32; i < 40; ++i) {
        yield generateSigningKey(keyChain, `/${i}`, HMAC);
      }
    }
  })()));
  const keys1 = gen.map(([pvt]) => pvt.name).map(String);

  const keyNames2 = await keyChain.listKeys();
  const keys2 = (await Promise.all(keyNames2.map((n) => keyChain.getKey(n, "signer"))))
    .map((pvt) => pvt.name.toString());

  await Promise.all(
    keys2.filter((u, i) => i % 4 === 0)
      .map((u) => keyChain.deleteKey(new Name(u))),
  );
  const keyNames3 = await keyChain.listKeys();
  const keys3 = (await Promise.all(keyNames3.map((n) => keyChain.getKey(n, "verifier"))))
    .map((pub) => pub.name.toString());

  const keys4 = [] as string[];
  for (let i = 0; i < 40; ++i) {
    try {
      const key = await keyChain.getKey(new Name(keys2[i]), "signer");
      switch (key.sigType) {
        case SigType.Sha256WithEcdsa:
          keys4.push("EC");
          break;
        case SigType.Sha256WithRsa:
          keys4.push("RSA");
          break;
        case SigType.HmacWithSha256:
          keys4.push("HMAC");
          break;
        default:
          keys4.push("bad");
          break;
      }
    } catch {
      keys4.push("");
    }
  }

  return {
    keys0,
    keys1,
    keys2,
    keys3,
    keys4,
  };
}

export function check(
    record: TestRecord,
    { skipHmac = false }: Options = {},
) {
  expect(record.keys0).toHaveLength(0);
  expect(record.keys1).toHaveLength(skipHmac ? 32 : 40);
  expect(record.keys2).toHaveLength(skipHmac ? 32 : 40);
  expect(record.keys3).toHaveLength(skipHmac ? 24 : 30);
  expect(record.keys4).toHaveLength(40);

  expect(record.keys4.filter((v) => v === "EC")).toHaveLength(12);
  expect(record.keys4.filter((v) => v === "RSA")).toHaveLength(12);
  expect(record.keys4.filter((v) => v === "HMAC")).toHaveLength(skipHmac ? 0 : 6);
  expect(record.keys4.filter((v) => v === "")).toHaveLength(skipHmac ? 16 : 10);

  record.keys1.sort((a, b) => a.localeCompare(b));
  record.keys2.sort((a, b) => a.localeCompare(b));
  expect(record.keys1).toEqual(record.keys2);
}
