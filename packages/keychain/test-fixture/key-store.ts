import { Name, SigType } from "@ndn/packet";
import { expect } from "vitest";

import { type NamedSigner, type NamedVerifier, type SigningAlgorithm, ECDSA, Ed25519, generateSigningKey, HMAC, KeyChain, RSA } from "..";

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

  const keyNames2 = (await keyChain.listKeys()).sort((a, b) => a.compare(b));
  const keys2 = (await Promise.all(keyNames2.map((n) => keyChain.getKey(n, "signer"))))
    .map((pvt) => pvt.name.toString());

  await Promise.all(
    keys2.filter((u, i) => i % 4 === 0)
      .map((u) => keyChain.deleteKey(new Name(u))),
  );
  const keyNames3 = (await keyChain.listKeys()).sort((a, b) => a.compare(b));
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

export function check(record: TestRecord, enabled: Enable = {},
) {
  let nEnabled = 0;
  let nDisabled = 0;
  for (const algoName of Object.keys(algoRecord)) {
    if (enabled[algoName as keyof typeof algoRecord] === false) {
      ++nDisabled;
    } else {
      ++nEnabled;
    }
  }

  expect(record.keys0).toHaveLength(0);
  expect(record.keys1).toHaveLength(nEnabled * 8);
  expect(record.keys2).toHaveLength(nEnabled * 8);
  expect(record.keys3).toHaveLength(nEnabled * 6);
  expect(record.keys4).toHaveLength((nEnabled + nDisabled) * 8);

  expect(record.keys4.filter((v) => v === "ECDSA")).toHaveLength(enabled.ECDSA === false ? 0 : 6);
  expect(record.keys4.filter((v) => v === "RSA")).toHaveLength(enabled.ECDSA === false ? 0 : 6);
  expect(record.keys4.filter((v) => v === "HMAC")).toHaveLength(enabled.HMAC === false ? 0 : 6);
  expect(record.keys4.filter((v) => v === "Ed25519")).toHaveLength(enabled.Ed25519 === false ? 0 : 6);
  expect(record.keys4.filter((v) => v === "")).toHaveLength(nEnabled * 2 + nDisabled * 8);

  expect(record.keys1).toEqual(record.keys2);
}
