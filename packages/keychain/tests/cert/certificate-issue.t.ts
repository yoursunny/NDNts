import { Component } from "@ndn/name";
import { Version } from "@ndn/naming-convention-03";

import { Certificate, EcPrivateKey, ValidityPeriod } from "../../src";

test("issue", async () => {
  const [issuerPrivateKey] = await EcPrivateKey.generate("/issuer/KEY/x", "P-384");
  const [, publicKey] = await EcPrivateKey.generate("/rp/KEY/y", "P-256");
  const validity = new ValidityPeriod(new Date(1542099529000), new Date(1602434283000));
  const cert = await Certificate.issue({
    // tslint:disable-next-line object-literal-sort-keys
    validity,
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
  const validity = new ValidityPeriod(new Date(1542099529000), new Date(1602434283000));
  const cert = await Certificate.selfSign({
    // tslint:disable-next-line object-literal-sort-keys
    validity,
    privateKey,
    publicKey,
  });
  expect(cert.name).toHaveLength(5);
  expect(publicKey.name.append("self").isPrefixOf(cert.name)).toBeTruthy();
  expect(cert.name.at(-1).is(Version)).toBeTruthy();

  const [, publicKeyY] = await EcPrivateKey.generate("/EC/KEY/y", "P-256");
  // tslint:disable-next-line object-literal-sort-keys
  expect(Certificate.selfSign({ validity, privateKey, publicKey: publicKeyY }))
    .rejects.toThrow(/mismatch/);
});
