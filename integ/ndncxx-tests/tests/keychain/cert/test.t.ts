import { Certificate, EcPrivateKey, KeyChain, ValidityPeriod } from "@ndn/keychain";
import { Component } from "@ndn/name";
import { Encoder } from "@ndn/tlv";

import { execute } from "../../../test-fixture";

test("decode", async () => {
  const keyChain = KeyChain.createTemp();
  const { publicKey } =
    await keyChain.generateKey(EcPrivateKey, "/A/KEY/x", ValidityPeriod.daysFromNow(1), "P-256");
  const { privateKey: issuerPrivateKey } =
    await keyChain.generateKey(EcPrivateKey, "/B/KEY/y", ValidityPeriod.daysFromNow(1), "P-256");

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
  expect(parseInt(validityNotBefore, 10)).toBe(validity.notBefore.getTime());
  expect(parseInt(validityNotAfter, 10)).toBe(validity.notAfter.getTime());
});
