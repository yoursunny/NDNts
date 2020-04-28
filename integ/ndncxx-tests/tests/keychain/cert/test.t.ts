import { Certificate, EcPrivateKey, ValidityPeriod } from "@ndn/keychain";
import { Component } from "@ndn/packet";
import { Encoder } from "@ndn/tlv";

import { execute } from "../../../test-fixture/cxxprogram";

test("decode", async () => {
  const [, publicKey] = await EcPrivateKey.generate("/A", "P-256");
  const [issuerPrivateKey] = await EcPrivateKey.generate("/B", "P-256");

  const validity = new ValidityPeriod(new Date(1542099529000), new Date(1602434283000));
  const cert = await Certificate.issue({
    validity,
    issuerId: Component.from("i"),
    issuerPrivateKey,
    publicKey,
  });

  const { stdout } = await execute(__dirname, [], { input: Encoder.encode(cert.data) as Buffer });
  const [certName, identity, keyId, issuerId, validityNotBefore, validityNotAfter] = stdout.split("\n");
  expect(certName).toBe(cert.name.toString());
  expect(identity).toBe(cert.certName.subjectName.toString());
  expect(keyId).toBe(cert.certName.keyId.toString());
  expect(issuerId).toBe(cert.certName.issuerId.toString());
  expect(Number.parseInt(validityNotBefore, 10)).toBe(validity.notBefore.getTime());
  expect(Number.parseInt(validityNotAfter, 10)).toBe(validity.notAfter.getTime());
});
