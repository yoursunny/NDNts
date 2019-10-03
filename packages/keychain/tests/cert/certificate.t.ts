import { Data } from "@ndn/l3pkt";
import { Name } from "@ndn/name";
import { Decoder, Encoder } from "@ndn/tlv";
import "@ndn/tlv/test-fixture";

import { buildCertificate, Certificate, CertificateName, theDigestKey, ValidityPeriod } from "../../src";

test("encode decode", async () => {
  const cert = await buildCertificate({
    name: new CertificateName("/operator", "key-1", "self", "%FD%01"),
    validity: new ValidityPeriod(new Date(1542099529000), new Date(1602434283000)),
    publicKey: new Uint8Array([0xC0, 0xC1]),
    signer: theDigestKey,
  });

  let data = cert.data;
  expect(data.name.toString()).toBe("/operator/KEY/key-1/self/%FD%01");
  expect(data.contentType).toBe(0x02);
  expect(data.freshnessPeriod).toBe(3600000);

  const wire = Encoder.encode(cert.data);
  data = new Decoder(wire).decode(Data);
  data.name = new Name("/operator/not-KEY/key-1/self/%FD%01");
  expect(() => new Certificate(data)).toThrow(/invalid/);

  data = new Decoder(wire).decode(Data);
  data.contentType = 0x00;
  expect(() => new Certificate(data)).toThrow(/ContentType/);

  data = new Decoder(wire).decode(Data);
  ValidityPeriod.set(data.sigInfo, undefined);
  expect(() => new Certificate(data)).toThrow(/ValidityPeriod/);
});

const NDN_TESTBED_ROOT_V2_NDNCERT = Buffer.from(`
  Bv0COwckCANuZG4IA0tFWQgIZZ1/pcWBEH0IA25kbggJ/QAAAWBxSlGbFAkYAQIZ
  BAA27oAV/QFPMIIBSzCCAQMGByqGSM49AgEwgfcCAQEwLAYHKoZIzj0BAQIhAP//
  //8AAAABAAAAAAAAAAAAAAAA////////////////MFsEIP////8AAAABAAAAAAAA
  AAAAAAAA///////////////8BCBaxjXYqjqT57PrvVV2mIa8ZR0GsMxTsPY7zjw+
  J9JgSwMVAMSdNgiG5wSTamZ44ROdJreBn36QBEEEaxfR8uEsQkf4vOblY6RA8ncD
  fYEt6zOg9KE5RdiYwpZP40Li/hp/m47n60p8D54WK84zV2sxXs7LtkBoN79R9QIh
  AP////8AAAAA//////////+85vqtpxeehPO5ysL8YyVRAgEBA0IABAUIdqatSfln
  i6u9XO2ZSmBA+MjDwkx2RiPtCCLsm4oKVn2Jyfa/yOSgZseGqnTEdbN1rDWvlIgA
  mxI0MUXVM1gWbRsBAxwWBxQIA25kbggDS0VZCAhlnX+lxYEQff0A/Sb9AP4PMjAx
  NzEyMjBUMDAxOTM5/QD/DzIwMjAxMjMxVDIzNTk1Of0BAiT9AgAg/QIBCGZ1bGxu
  YW1l/QICEE5ETiBUZXN0YmVkIFJvb3QXRjBEAiAwtzbOA+F6xiLB7iYBzSpWpZzf
  mtWqsXljm/SkXu4rPQIgTFMi3zZm/Eh+X0tzrcOxDhbmsl2chkIjyookaM9pukM=`, "base64");

test("decode ndn-testbed-root-v2.ndncert", () => {
  const data = new Decoder(NDN_TESTBED_ROOT_V2_NDNCERT).decode(Data);
  const cert = new Certificate(data);
  expect(cert.name.toString()).toBe("/ndn/KEY/e%9D%7F%A5%C5%81%10%7D/ndn/%FD%00%00%01%60qJQ%9B");
  expect(cert.certName.subjectName.toString()).toBe("/ndn");
  expect(cert.certName.keyId.toString()).toBe("e%9D%7F%A5%C5%81%10%7D");
  expect(cert.certName.issuerId.toString()).toBe("ndn");
  expect(cert.certName.version.toString()).toBe("%FD%00%00%01%60qJQ%9B");
  expect(cert.validity.notBefore.getTime()).toBe(1513729179000);
  expect(cert.validity.notAfter.getTime()).toBe(1609459199000);
  expect(cert.publicKey).toEqualUint8Array(Buffer.from(`
    MIIBSzCCAQMGByqGSM49AgEwgfcCAQEwLAYHKoZIzj0BAQIhAP////8AAAABAAAA
    AAAAAAAAAAAA////////////////MFsEIP////8AAAABAAAAAAAAAAAAAAAA////
    ///////////8BCBaxjXYqjqT57PrvVV2mIa8ZR0GsMxTsPY7zjw+J9JgSwMVAMSd
    NgiG5wSTamZ44ROdJreBn36QBEEEaxfR8uEsQkf4vOblY6RA8ncDfYEt6zOg9KE5
    RdiYwpZP40Li/hp/m47n60p8D54WK84zV2sxXs7LtkBoN79R9QIhAP////8AAAAA
    //////////+85vqtpxeehPO5ysL8YyVRAgEBA0IABAUIdqatSflni6u9XO2ZSmBA
    +MjDwkx2RiPtCCLsm4oKVn2Jyfa/yOSgZseGqnTEdbN1rDWvlIgAmxI0MUXVM1g=`, "base64"));
});
