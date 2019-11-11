import "@ndn/name/test-fixture";

import { Component } from "@ndn/name";
import { Version } from "@ndn/naming-convention2";

import { Certificate, EcPrivateKey, ValidityPeriod } from "../..";

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
  const [privateKey, publicKey] = await EcPrivateKey.generate("/EC/KEY/x", "P-256");

  const cert = await Certificate.selfSign({ privateKey, publicKey });
  expect(cert.name).toHaveLength(5);
  expect(cert.name.getPrefix(-1)).toEqualName("/EC/KEY/x/self");
  expect(cert.name.at(-1).is(Version)).toBeTruthy();

  const [, publicKeyY] = await EcPrivateKey.generate("/EC/KEY/y", "P-256");

  await expect(Certificate.selfSign({
    validity: ValidityPeriod.daysFromNow(1),
    privateKey,
    publicKey: publicKeyY,
  })).rejects.toThrow(/mismatch/);
});
