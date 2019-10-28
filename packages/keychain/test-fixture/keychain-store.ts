import { Name } from "@ndn/name";

import { EcPrivateKey, KeyChain, ValidityPeriod } from "../src";

export interface TestRecord {
  keys0: string[];
  certs0: string[];
  keys1: string[];
  certs1: string[];
  keys2: string[];
  certs2: string[];
  keys3: string[];
  certs3: string[];
  keys4: string[];
  certs4: string[];
}

function nameToString(name: Name) {
  return name.toString();
}

export async function execute(keyChain: KeyChain): Promise<TestRecord> {
  const keys0 = (await keyChain.listKeys()).map(nameToString);
  const certs0 = (await keyChain.listCerts()).map(nameToString);

  const validity = ValidityPeriod.daysFromNow(1);
  const gens = await Promise.all(Array.from((function*() {
    for (let i = 0; i < 40; ++i) {
      yield keyChain.generateKey(EcPrivateKey, `/${i}`, validity, "P-256");
    }
  })()));
  const keys1 = gens.map((gen) => gen.privateKey.name).map(nameToString);
  const certs1 = gens.map((gen) => gen.selfSigned.name).map(nameToString);

  const keys2 = (await keyChain.listKeys()).map(nameToString);
  const certs2 = (await keyChain.listCerts()).map(nameToString);

  await Promise.all(
    gens.filter((gen, i) => i % 4 === 0)
    .map((gen) => keyChain.deleteKey(gen.privateKey.name)),
  );

  const keys3 = (await keyChain.listKeys()).map(nameToString);
  const certs3 = (await keyChain.listCerts()).map(nameToString);

  const keys4 = [] as string[];
  const certs4 = [] as string[];
  for (let i = 0; i < 40; ++i) {
    try {
      const key = await keyChain.getKey(new Name(keys1[i]));
      if (key instanceof EcPrivateKey) {
        keys4.push("EC");
      } else {
        keys4.push("bad");
      }
    } catch {
      keys4.push("");
    }
    try {
      const cert = await keyChain.getCert(new Name(certs1[i]));
      certs4.push(cert.name.toString());
    } catch {
      certs4.push("");
    }
  }

  return {
    keys0,
    certs0,
    keys1,
    certs1,
    keys2,
    certs2,
    keys3,
    certs3,
    keys4,
    certs4,
  } as TestRecord;
}

export function check(record: TestRecord) {
  expect(record.keys0).toHaveLength(0);
  expect(record.certs0).toHaveLength(0);
  expect(record.keys1).toHaveLength(40);
  expect(record.certs1).toHaveLength(40);
  expect(record.keys2).toHaveLength(40);
  expect(record.certs2).toHaveLength(40);
  expect(record.keys3).toHaveLength(30);
  expect(record.certs3).toHaveLength(30);
  expect(record.keys4).toHaveLength(40);
  expect(record.certs4).toHaveLength(40);

  expect(record.keys4.filter((v) => v === "EC")).toHaveLength(30);
  expect(record.certs4.filter((v) => v === "")).toHaveLength(10);

  record.certs1.sort();
  record.certs2.sort();
  expect(record.certs1).toEqual(record.certs2);
}
