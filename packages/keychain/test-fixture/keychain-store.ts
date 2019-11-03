import { Name } from "@ndn/name";

import { Certificate, EcPrivateKey, EcPublicKey, KeyChain, RsaPrivateKey, RsaPublicKey } from "../src";

export interface TestRecord {
  keys0: string[];
  certs0: string[];
  keys2: string[];
  certs2: string[];
  keys3: string[];
  certs3: string[];
  keys4: string[];
  certs4: string[];
  keys5: string[];
}

function nameToString(name: Name) {
  return name.toString();
}

export async function execute(keyChain: KeyChain): Promise<TestRecord> {
  const keys0 = (await keyChain.listKeys()).map(nameToString);
  const certs0 = (await keyChain.listCerts()).map(nameToString);

  await Promise.all(Array.from((function*(): Generator<Promise<unknown>> {
    for (let i = 0; i < 20; ++i) {
      yield EcPrivateKey.generate(`/${i}`, "P-256", keyChain);
    }
    for (let i = 20; i < 40; ++i) {
      yield RsaPrivateKey.generate(`/${i}`, 2048, keyChain);
    }
  })()));

  const keys2 = (await keyChain.listKeys()).map(nameToString);
  const certs2 = (await keyChain.listCerts()).map(nameToString);

  await Promise.all(
    keys2.filter((u, i) => i % 4 === 0)
    .map((u) => keyChain.deleteKey(new Name(u))),
  );

  const keys3 = (await keyChain.listKeys()).map(nameToString);
  const certs3 = (await keyChain.listCerts()).map(nameToString);

  const keys4 = [] as string[];
  const certs4 = [] as string[];
  const keys5 = [] as string[];
  for (let i = 0; i < 40; ++i) {
    try {
      const key = await keyChain.getKey(new Name(keys2[i]));
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
    try {
      const cert = await keyChain.getCert(new Name(certs2[i]));
      certs4.push(cert.name.toString());
      try {
        const key = await Certificate.getPublicKey(cert);
        switch (true) {
          case key instanceof EcPublicKey:
            keys5.push("EC");
            break;
          case key instanceof RsaPublicKey:
            keys5.push("RSA");
            break;
          default:
            keys5.push("bad");
            break;
        }
      } catch (err) {
        keys5.push(`err ${err}`);
      }
    } catch {
      certs4.push("");
      keys5.push("");
    }
  }

  return {
    keys0,
    certs0,
    keys2,
    certs2,
    keys3,
    certs3,
    keys4,
    certs4,
    keys5,
  } as TestRecord;
}

export function check(record: TestRecord) {
  expect(record.keys0).toHaveLength(0);
  expect(record.certs0).toHaveLength(0);
  expect(record.keys2).toHaveLength(40);
  expect(record.certs2).toHaveLength(40);
  expect(record.keys3).toHaveLength(30);
  expect(record.certs3).toHaveLength(30);
  expect(record.keys4).toHaveLength(40);
  expect(record.certs4).toHaveLength(40);
  expect(record.keys5).toHaveLength(40);

  expect(record.keys4.filter((v) => v === "EC")).toHaveLength(15);
  expect(record.keys4.filter((v) => v === "RSA")).toHaveLength(15);
  expect(record.certs4.filter((v) => v === "")).toHaveLength(10);
  expect(record.keys5).toEqual(record.keys4);
}
