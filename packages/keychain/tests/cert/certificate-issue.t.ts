import "@ndn/packet/test-fixture/expect";

import { Version } from "@ndn/naming-convention2";
import { Component } from "@ndn/packet";

import { Certificate, generateSigningKey, ValidityPeriod } from "../..";

test("issue", async () => {
  const [issuerPrivateKey] = await generateSigningKey("/issuer");
  const [, publicKey] = await generateSigningKey("/rp");

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
  const [privateKey, publicKey] = await generateSigningKey("/my/KEY/x");

  const cert = await Certificate.selfSign({ privateKey, publicKey });
  expect(cert.name).toHaveLength(5);
  expect(cert.name.getPrefix(-1)).toEqualName("/my/KEY/x/self");
  expect(cert.name.at(-1).is(Version)).toBeTruthy();
  expect(cert.isSelfSigned).toBeTruthy();

  const [, publicKeyY] = await generateSigningKey("/my/KEY/y");

  await expect(Certificate.selfSign({
    validity: ValidityPeriod.daysFromNow(1),
    privateKey,
    publicKey: publicKeyY,
  })).rejects.toThrow(/mismatch/);
});
