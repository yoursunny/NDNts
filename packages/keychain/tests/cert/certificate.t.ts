import "@ndn/packet/test-fixture/expect";

import { Data, Name, SigType } from "@ndn/packet";
import { Decoder, Encoder } from "@ndn/tlv";

import { Certificate, CertNaming, generateSigningKey, ValidityPeriod } from "../..";
import * as ndn_testbed_certs from "../../test-fixture/ndn-testbed-certs";

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

test("decode testbed certs", async () => {
  const data0 = new Decoder(ndn_testbed_certs.ROOT_V2_NDNCERT).decode(Data);
  const cert0 = Certificate.fromData(data0);
  expect(cert0.name).toEqualName("/ndn/KEY/e%9D%7F%A5%C5%81%10%7D/ndn/%FD%00%00%01%60qJQ%9B");
  const certName0 = CertNaming.parseCertName(cert0.name);
  expect(certName0.subjectName).toEqualName("/ndn");
  expect(certName0.keyId).toEqualComponent("e%9D%7F%A5%C5%81%10%7D");
  expect(certName0.issuerId).toEqualComponent("ndn");
  expect(certName0.version).toEqualComponent("%FD%00%00%01%60qJQ%9B");
  expect(cert0.validity.notBefore).toBe(1513729179000);
  expect(cert0.validity.notAfter).toBe(1609459199000);
  expect(cert0.publicKeySpki).toEqualUint8Array(ndn_testbed_certs.ROOT_V2_SPKI);
  expect(cert0.isSelfSigned).toBeTruthy();
  const pub0 = await cert0.createVerifier();
  expect(pub0.sigType).toBe(SigType.Sha256WithEcdsa);

  const data1 = new Decoder(ndn_testbed_certs.ARIZONA_20190312).decode(Data);
  await pub0.verify(data1);
  await expect(pub0.verify(data1)).resolves.toBeUndefined();

  const cert1 = Certificate.fromData(data1);
  expect(cert1.isSelfSigned).toBeFalsy();
  expect(cert1.issuer).toEqualName(certName0.keyName);
  const pub1 = await cert1.createVerifier();
  expect(pub1.sigType).toBe(SigType.Sha256WithRsa);
});
