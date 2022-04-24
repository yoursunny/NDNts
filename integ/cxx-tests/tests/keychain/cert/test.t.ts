import { Certificate, CertNaming, generateSigningKey, ValidityPeriod } from "@ndn/keychain";
import { Component } from "@ndn/packet";
import { Encoder } from "@ndn/tlv";
import { expect, test } from "vitest";

import { execute } from "../../../test-fixture/cxxprogram";

test("decode", async () => {
  const [, publicKey] = await generateSigningKey("/A");
  const [issuerPrivateKey] = await generateSigningKey("/B");

  const validity = new ValidityPeriod(1542099529000, 1602434283000);
  const cert = await Certificate.issue({
    validity,
    issuerId: Component.from("i"),
    issuerPrivateKey,
    publicKey,
  });
  const certName = CertNaming.parseCertName(cert.name);

  const { stdout } = await execute(__dirname, [], { input: Encoder.encode(cert.data) as Buffer });
  const [name, identity, keyId, issuerId, validityNotBefore, validityNotAfter] =
    stdout.split("\n") as [string, string, string, string, string, string];
  expect(name).toBe(cert.name.toString());
  expect(identity).toBe(certName.subjectName.toString());
  expect(keyId).toBe(certName.keyId.toString());
  expect(issuerId).toBe(certName.issuerId.toString());
  expect(Number.parseInt(validityNotBefore, 10)).toBe(validity.notBefore);
  expect(Number.parseInt(validityNotAfter, 10)).toBe(validity.notAfter);
});
