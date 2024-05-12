import { Certificate, CertNaming, generateSigningKey } from "@ndn/keychain";
import { Component, ValidityPeriod } from "@ndn/packet";
import { Encoder } from "@ndn/tlv";
import { expect, test } from "vitest";

import * as cxx from "../../../test-fixture/cxxprogram";

test("decode", async () => {
  const exe = await cxx.compile(import.meta.dirname);

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

  const { stdout } = await exe.run([], {
    input: Buffer.from(Encoder.encode(cert.data)),
  });
  const [name, identity, keyId, issuerId, validityNotBefore, validityNotAfter] = stdout;
  expect(name).toBe(cert.name.toString());
  expect(identity).toBe(certName.subjectName.toString());
  expect(keyId).toBe(certName.keyId.toString());
  expect(issuerId).toBe(certName.issuerId.toString());
  expect(Number(validityNotBefore)).toBe(validity.notBefore);
  expect(Number(validityNotAfter)).toBe(validity.notAfter);
});
