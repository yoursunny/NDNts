import { Name, SigType } from "@ndn/packet";
import type { ReadonlyDeep } from "type-fest";
import { expect } from "vitest";

import { ECDSA, Ed25519, generateSigningKey, HMAC, type KeyChain, type NamedSigner, type NamedVerifier, RSA, type SigningAlgorithm } from "..";

const algoRecord = {
  ECDSA,
  RSA,
  HMAC,
  Ed25519,
} as const;

const algoSigTypes: Record<number, keyof typeof algoRecord> = {
  [SigType.Sha256WithEcdsa]: "ECDSA",
  [SigType.Sha256WithRsa]: "RSA",
  [SigType.HmacWithSha256]: "HMAC",
  [SigType.Ed25519]: "Ed25519",
};

export type Enable = Partial<Record<keyof typeof algoRecord, boolean>>;

export interface TestRecord {
  keys0: string[];
  keys1: string[];
  keys2: string[];
  keys3: string[];
  keys4: Array<"bad" | "" | keyof typeof algoRecord>;
}

/**
 * Test a KeyChain for its key storage operations.
 * @param keyChain - Target KeyChain.
 * @param enabled - Which algorithms are supported by the KeyChain.
 * @returns A test record to be analyzed by {@link check}.
 */
export async function execute(keyChain: KeyChain, enabled: Enable = {}): Promise<TestRecord> {
  const keys0 = (await keyChain.listKeys()).map(String);

  const gen = await Promise.all(Array.from((function*(): Generator<Promise<[NamedSigner, NamedVerifier]>> {
    for (const [i, [algoName, algo]] of Object.entries(algoRecord).entries()) {
      if (enabled[algoName as keyof typeof algoRecord] === false) {
        continue;
      }
      for (let j = 0; j < 8; ++j) {
        yield generateSigningKey(keyChain, `/${i}/${j}`, algo as SigningAlgorithm);
      }
    }
  })()));
  const keys1 = gen.map(([pvt]) => pvt.name).map(String);

  const keyNames2 = await keyChain.listKeys();
  keyNames2.sort(Name.compare);
  const keys2 = (await Promise.all(keyNames2.map((n) => keyChain.getKey(n, "signer"))))
    .map((pvt) => pvt.name.toString());

  await Promise.all(keys2.filter((u, i) => i % 4 === 0)
    .map((u) => keyChain.deleteKey(new Name(u))));
  const keyNames3 = await keyChain.listKeys();
  keyNames3.sort(Name.compare);
  const keys3 = (await Promise.all(keyNames3.map((n) => keyChain.getKey(n, "verifier"))))
    .map((pub) => pub.name.toString());

  const keys4: TestRecord["keys4"] = [];
  for (let i = 0; i < Object.keys(algoRecord).length * 8; ++i) {
    try {
      const key = await keyChain.getKey(new Name(keys2[i]), "signer");
      keys4.push(algoSigTypes[key.sigType] ?? "bad");
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

/** Check test records. */
export function check({ keys0, keys1, keys2, keys3, keys4 }: ReadonlyDeep<TestRecord>, enabled: Enable = {}) {
  let nEnabled = 0;
  let nDisabled = 0;
  for (const algoName of Object.keys(algoRecord)) {
    if (enabled[algoName as keyof typeof algoRecord] === false) {
      ++nDisabled;
    } else {
      ++nEnabled;
    }
  }

  expect(keys0).toHaveLength(0);
  expect(keys1).toHaveLength(nEnabled * 8);
  expect(keys2).toHaveLength(nEnabled * 8);
  expect(keys3).toHaveLength(nEnabled * 6);
  expect(keys4).toHaveLength((nEnabled + nDisabled) * 8);

  expect(keys4.filter((v) => v === "ECDSA")).toHaveLength(enabled.ECDSA === false ? 0 : 6);
  expect(keys4.filter((v) => v === "RSA")).toHaveLength(enabled.RSA === false ? 0 : 6);
  expect(keys4.filter((v) => v === "HMAC")).toHaveLength(enabled.HMAC === false ? 0 : 6);
  expect(keys4.filter((v) => v === "Ed25519")).toHaveLength(enabled.Ed25519 === false ? 0 : 6);
  expect(keys4.filter((v) => v === "")).toHaveLength(nEnabled * 2 + nDisabled * 8);

  expect(keys1).toEqual(keys2);
}
