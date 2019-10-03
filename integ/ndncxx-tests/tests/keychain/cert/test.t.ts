import { Certificate, EcPrivateKey, ValidityPeriod } from "@ndn/keychain";
import { Component } from "@ndn/name";
import { Encoder } from "@ndn/tlv";

import { invoke } from "../../../test-fixture/cxxprogram";

test("cxx decode", async () => {
  const [, publicKey] = await EcPrivateKey.generate("/A/KEY/x", "P-256");
  const [issuerPrivateKey] = await EcPrivateKey.generate("/B/KEY/y", "P-256");
  const validity = new ValidityPeriod(new Date(1542099529000), new Date(1602434283000));
  const cert = await Certificate.issue({
    // tslint:disable-next-line object-literal-sort-keys
    validity,
    issuerId: Component.from("i"),
    issuerPrivateKey,
    publicKey,
  });

  const [certName, identity, keyId, issuerId, validityNotBefore, validityNotAfter] =
    await invoke(__dirname, [], Encoder.encode(cert.data));
  expect(certName).toBe(cert.name.toString());
  expect(identity).toBe(cert.certName.subjectName.toString());
  expect(keyId).toBe(cert.certName.keyId.toString());
  expect(issuerId).toBe(cert.certName.issuerId.toString());
  expect(parseInt(validityNotBefore, 10)).toBe(validity.notBefore.getTime());
  expect(parseInt(validityNotAfter, 10)).toBe(validity.notAfter.getTime());
});
