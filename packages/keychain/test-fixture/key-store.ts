import { Name } from "@ndn/name";

import { EcPrivateKey, KeyChain, PrivateKey, PublicKey, RsaPrivateKey } from "../src";

export interface TestRecord {
  keys0: string[];
  keys1: string[];
  keys2: string[];
  keys3: string[];
  keys4: string[];
}

export async function execute(keyChain: KeyChain): Promise<TestRecord> {
  const keys0 = (await keyChain.listKeys()).map(String);

  const gen = await Promise.all(Array.from((function*(): Generator<Promise<[PrivateKey, PublicKey]>> {
    for (let i = 0; i < 20; ++i) {
      yield EcPrivateKey.generate(`/${i}`, "P-256", keyChain);
    }
    for (let i = 20; i < 40; ++i) {
      yield RsaPrivateKey.generate(`/${i}`, 2048, keyChain);
    }
  })()));
  const keys1 = gen.map(([pvt]) => pvt.name).map(String);

  const keyNames2 = await keyChain.listKeys();
  const keys2 = (await Promise.all(keyNames2.map((n) => keyChain.getPrivateKey(n))))
                .map((pvt) => pvt.name.toString());

  await Promise.all(
    keys2.filter((u, i) => i % 4 === 0)
    .map((u) => keyChain.deleteKey(new Name(u))),
  );
  const keyNames3 = await keyChain.listKeys();
  const keys3 = (await Promise.all(keyNames3.map((n) => keyChain.getPublicKey(n))))
                .map((pub) => pub.name.toString());

  const keys4 = [] as string[];
  for (let i = 0; i < 40; ++i) {
    try {
      const key = await keyChain.getPrivateKey(new Name(keys2[i]));
      switch (true) {
        case key instanceof EcPrivateKey:
          keys4.push("EC");
          break;
        case key instanceof RsaPrivateKey:
          keys4.push("RSA");
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
  } as TestRecord;
}

export function check(record: TestRecord) {
  expect(record.keys0).toHaveLength(0);
  expect(record.keys1).toHaveLength(40);
  expect(record.keys2).toHaveLength(40);
  expect(record.keys3).toHaveLength(30);
  expect(record.keys4).toHaveLength(40);

  expect(record.keys4.filter((v) => v === "EC")).toHaveLength(15);
  expect(record.keys4.filter((v) => v === "RSA")).toHaveLength(15);
  expect(record.keys4.filter((v) => v === "")).toHaveLength(10);

  record.keys1.sort();
  record.keys2.sort();
  expect(record.keys1).toEqual(record.keys2);
}
