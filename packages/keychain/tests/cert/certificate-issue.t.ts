import { Component, Name } from "@ndn/name";
import { Version } from "@ndn/naming-convention-03";

import { Certificate, EcPrivateKey, KeyChain, ValidityPeriod } from "../../src";

test("issue", async () => {
  const [issuerPrivateKey] = await EcPrivateKey.generate("/issuer", "P-384");
  const [, publicKey] = await EcPrivateKey.generate("/rp", "P-256");

  const cert = await Certificate.issue({
    validity: ValidityPeriod.daysFromNow(1),
    issuerId: Component.from("i"),
    issuerPrivateKey,
    publicKey,
  });

  expect(cert.name).toHaveLength(5);
  expect(publicKey.name.append("i").isPrefixOf(cert.name)).toBeTruthy();
  expect(cert.name.at(-1).is(Version)).toBeTruthy();
});

test("self-sign", async () => {
  const keyChain = KeyChain.createTemp();
  const [privateKey] = await EcPrivateKey.generate("/EC/KEY/x", "P-256", keyChain);

  const certNames = await keyChain.listCerts(new Name("/EC/KEY/x/self"));
  expect(certNames).toHaveLength(1);
  const cert = await keyChain.getCert(certNames[0]);
  expect(cert.name).toHaveLength(5);
  expect(cert.name.at(-1).is(Version)).toBeTruthy();

  const [, publicKeyY] = await EcPrivateKey.generate("/EC/KEY/y", "P-256");

  await expect(Certificate.selfSign({
    validity: ValidityPeriod.daysFromNow(1),
    privateKey,
    publicKey: publicKeyY,
  })).rejects.toThrow(/mismatch/);
});
