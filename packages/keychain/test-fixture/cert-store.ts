import { Component, Name } from "@ndn/packet";

import { Certificate, ECDSA, generateSigningKey, KeyChain, ValidityPeriod } from "..";

export interface TestRecord {
  key: string;
  certs0: string[];
  certs1: string[];
  certs2: string[];
  certs3: string[];
  certs4: string[];
}

export async function execute(keyChain: KeyChain): Promise<TestRecord> {
  const [issuerPrivateKey] = await generateSigningKey("/I", ECDSA, { curve: "P-384" });
  const [privateKey, publicKey] = await generateSigningKey(keyChain, "/K");
  const selfSigned = await Certificate.selfSign({ privateKey, publicKey });
  const issued = await Certificate.issue({
    publicKey, issuerPrivateKey,
    issuerId: Component.from("issuer"),
    validity: ValidityPeriod.daysFromNow(1),
  });

  const certs0 = (await keyChain.listCerts()).map(String);

  await keyChain.insertCert(selfSigned);
  const certs1 = (await keyChain.listCerts()).map(String);

  await keyChain.insertCert(issued);
  const certNames2 = await keyChain.listCerts();
  const certs2 = (await Promise.all(certNames2.map((n) => keyChain.getCert(n))))
    .map((cert) => cert.name.toString());

  await keyChain.deleteCert(selfSigned.name);
  const certs3 = (await keyChain.listCerts()).map(String);

  await keyChain.deleteKey(privateKey.name);
  const certs4 = (await keyChain.listCerts()).map(String);

  return {
    key: privateKey.name.toString(),
    certs0,
    certs1,
    certs2,
    certs3,
    certs4,
  };
}

export function check(record: TestRecord) {
  expect(record.certs0).toHaveLength(0);
  expect(record.certs1).toHaveLength(1);
  expect(record.certs2).toHaveLength(2);
  expect(record.certs3).toHaveLength(1);
  expect(record.certs4).toHaveLength(0);

  expect(new Name(`${record.key}/self`).isPrefixOf(record.certs1[0]!)).toBeTruthy();
  expect(new Name(`${record.key}/issuer`).isPrefixOf(record.certs3[0]!)).toBeTruthy();
  expect(record.certs2).toEqual(expect.arrayContaining([...record.certs1, ...record.certs3]));
}
