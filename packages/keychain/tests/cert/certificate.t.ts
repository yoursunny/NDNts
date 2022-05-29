import "@ndn/packet/test-fixture/expect";

import { Data, Name, SigType } from "@ndn/packet";
import { Decoder, Encoder } from "@ndn/tlv";
import { expect, test } from "vitest";

import { Certificate, CertNaming, createVerifier, generateSigningKey, SigningAlgorithmListFull, SigningAlgorithmListSlim, ValidityPeriod } from "../..";
import * as sample_certs from "../../test-fixture/certs";

test("encode decode", async () => {
  const [pvt] = await generateSigningKey("/operator/KEY/key-1");
  const cert = await Certificate.build({
    name: new Name("/operator/KEY/key-1/self/%FD%01"),
    validity: new ValidityPeriod(1542099529000, 1602434283000),
    publicKeySpki: Uint8Array.of(0xC0, 0xC1),
    signer: pvt,
  });
  expect(cert.issuer).toEqualName(pvt.name);
  expect(cert.isSelfSigned).toBeTruthy();
  expect(() => cert.checkValidity(1542099529000)).not.toThrow();
  expect(() => cert.checkValidity(1602434283000)).not.toThrow();
  expect(() => cert.checkValidity(1542099528000)).toThrow(/expired/);
  expect(() => cert.checkValidity(1602434284000)).toThrow(/expired/);

  let data = cert.data;
  expect(data.name).toEqualName("/operator/KEY/key-1/self/%FD%01");
  expect(data.contentType).toBe(0x02);
  expect(data.freshnessPeriod).toBe(3600000);

  const wire = Encoder.encode(cert.data);
  data = new Decoder(wire).decode(Data);
  data.name = new Name("/operator/not-KEY/key-1/self/%FD%01");
  expect(() => Certificate.fromData(data)).toThrow(/name/);

  data = new Decoder(wire).decode(Data);
  data.contentType = 0x00;
  expect(() => Certificate.fromData(data)).toThrow(/ContentType/);

  data = new Decoder(wire).decode(Data);
  ValidityPeriod.set(data.sigInfo, undefined);
  expect(() => Certificate.fromData(data)).toThrow(/ValidityPeriod/);
});

test("verify ECDSA cert", async () => {
  const cert = Certificate.fromData(sample_certs.TestbedRootX3());
  expect(cert).toHaveName("/ndn/KEY/%EC%F1L%8EQ%23%15%E0/ndn/%FD%00%00%01u%E6%7F2%10");
  const certName = CertNaming.parseCertName(cert.name);
  expect(certName.subjectName).toEqualName("/ndn");
  expect(certName.keyId).toEqualComponent("%EC%F1L%8EQ%23%15%E0");
  expect(certName.issuerId).toEqualComponent("ndn");
  expect(certName.version).toEqualComponent("%FD%00%00%01u%E6%7F2%10");
  expect(cert.validity.notBefore).toBe(Date.UTC(2020, 11 - 1, 20, 16, 31, 37));
  expect(cert.validity.notAfter).toBe(Date.UTC(2024, 12 - 1, 31, 23, 59, 59));
  expect(cert.publicKeySpki).toEqualUint8Array(sample_certs.TestbedRootX3Spki);
  expect(cert.isSelfSigned).toBeTruthy();

  const pub = await createVerifier(cert, { checkValidity: false });
  expect(pub.sigType).toBe(SigType.Sha256WithEcdsa);
  await pub.verify(sample_certs.TestbedNeu20201217());
});

test("verify RSA cert", async () => {
  const cert = Certificate.fromData(sample_certs.TestbedArizona20200301());
  expect(cert.isSelfSigned).toBeFalsy();
  await expect(createVerifier(cert, { algoList: SigningAlgorithmListSlim, checkValidity: false }))
    .rejects.toThrow();

  const pub = await createVerifier(cert, { algoList: SigningAlgorithmListFull, checkValidity: false });
  expect(pub.sigType).toBe(SigType.Sha256WithRsa);
  await pub.verify(sample_certs.TestbedShijunxiao20200301());
});

test("decode Ed25519 cert", async () => {
  const data = sample_certs.Ed25519Demo();
  const cert = Certificate.fromData(data);

  const pub = await createVerifier(cert, {
    algoList: SigningAlgorithmListFull,
    checkValidity: false,
  });
  await pub.verify(data);
});
