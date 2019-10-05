import { Component, Name } from "@ndn/name";
import { Version } from "@ndn/naming-convention-03";

import { Certificate, EcPrivateKey, KeyChain, ValidityPeriod } from "../../src";

test("issue", async () => {
  const issuer = KeyChain.createTemp();
  const { privateKey: issuerPrivateKey } =
    await issuer.generateKey(EcPrivateKey, "/issuer/KEY/x", ValidityPeriod.daysFromNow(3), "P-384");

  const rp = KeyChain.createTemp();
  const { publicKey } =
    await rp.generateKey(EcPrivateKey, "/rp/KEY/y", ValidityPeriod.daysFromNow(2), "P-256");

  const cert = await Certificate.issue({
    // tslint:disable-next-line object-literal-sort-keys
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
  const { privateKey, selfSigned: cert } =
    await keyChain.generateKey(EcPrivateKey, "/EC/KEY/x", ValidityPeriod.daysFromNow(1), "P-256");

  expect(cert.name).toHaveLength(5);
  expect(new Name("/EC/KEY/x/self").isPrefixOf(cert.name)).toBeTruthy();
  expect(cert.name.at(-1).is(Version)).toBeTruthy();

  const { publicKey: publicKeyY } =
    await keyChain.generateKey(EcPrivateKey, "/EC/KEY/y", ValidityPeriod.daysFromNow(1), "P-256");

  await expect(Certificate.selfSign({
    // tslint:disable-next-line object-literal-sort-keys
    validity: ValidityPeriod.daysFromNow(1),
    privateKey,
    publicKey: publicKeyY,
  })).rejects.toThrow(/mismatch/);
});
