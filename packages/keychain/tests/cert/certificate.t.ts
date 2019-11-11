import "@ndn/name/test-fixture";
import "@ndn/tlv/test-fixture";

import { Data } from "@ndn/l3pkt";
import { Name } from "@ndn/name";
import { Decoder, Encoder } from "@ndn/tlv";

import { Certificate, CertificateName, EcPublicKey, theDigestKey, ValidityPeriod } from "../..";

test("encode decode", async () => {
  const cert = await Certificate.build({
    name: new CertificateName("/operator", "key-1", "self", "%FD%01"),
    validity: new ValidityPeriod(new Date(1542099529000), new Date(1602434283000)),
    publicKey: Uint8Array.of(0xC0, 0xC1),
    signer: theDigestKey,
  });

  let data = cert.data;
  expect(data.name).toEqualName("/operator/KEY/key-1/self/%FD%01");
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
  data.sigInfo = undefined;
  expect(() => new Certificate(data)).toThrow(/SigInfo/);

  data = new Decoder(wire).decode(Data);
  ValidityPeriod.set(data.sigInfo!, undefined);
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
const NDN_TESTBED_ARIZONA_20190312 = Buffer.from(`
  Bv0CxQcxCANuZG4IA2VkdQgHYXJpem9uYQgDS0VZCAiorqTUoPxZxQgCTkEICf0A
  AAFpeFZoshQJGAECGQQANu6AFf0BJjCCASIwDQYJKoZIhvcNAQEBBQADggEPADCC
  AQoCggEBAOkJgI/V5Qhoz/5IK3ifMwu6iuLy22DdjX7U3b1KBf9C1HiD+lGTdrsB
  gTPTGbbxY9y9s5ZxHoE6lwRmV82Z09W5Ox7AlJy7Pl+cmEVSx+ozxkmaxzUySu6h
  rq2DVqL8zqjpL0MH7JOh98k0o7y9LJ2oprWAqQYLyGir2Hu5CxJ+YnQUa/o0PSgP
  fbfWXuLObm6u28FM/9cbTp7bzp2rDV9vsIrS2bdTkwAmp8kWMAvms2iEkLKo9Akf
  Z0fl7vpf3OKX3RdVYM6XZw+UrI1bB42/x6VQea7yXgTXL4+Z5R5hCHSjGJdUI1Qb
  i61sAZgId62uywyydPAqxjQ7H8fQZCUCAwEAARb9ARAbAQMcFgcUCANuZG4IA0tF
  WQgIZZ1/pcWBEH39AP0m/QD+DzIwMTkwMzEyVDE4MzUyMv0A/w8yMDIwMDMxMlQx
  ODM1MjL9AQLH/QIAD/0CAQdhZHZpc29y/QICAP0CADf9AgEFZW1haWz9AgIqL25k
  bi9lZHUvYXJpem9uYS9Ab3BlcmF0b3JzLm5hbWVkLWRhdGEubmV0/QIAKf0CAQhm
  dWxsbmFtZf0CAhlUaGUgVW5pdmVyc2l0eSBvZiBBcml6b25h/QIADf0CAQVncm91
  cP0CAgD9AgAP/QIBB2hvbWV1cmz9AgIA/QIAJP0CAQxvcmdhbml6YXRpb279AgIQ
  TkROIFRlc3RiZWQgUm9vdBdHMEUCIQD6lFxw9W7wso9iBSfg0Mqxa2Q6ayqsrV4P
  ernaiaSKyAIgf2zQNwWShPIY1uPbtKOPjnoyCT33HUTnTnm+ejmAQng=`, "base64");

test("decode testbed certs", async () => {
  const data0 = new Decoder(NDN_TESTBED_ROOT_V2_NDNCERT).decode(Data);
  const cert0 = new Certificate(data0);
  expect(cert0.name).toEqualName("/ndn/KEY/e%9D%7F%A5%C5%81%10%7D/ndn/%FD%00%00%01%60qJQ%9B");
  expect(cert0.certName.subjectName).toEqualName("/ndn");
  expect(cert0.certName.keyId).toEqualComponent("e%9D%7F%A5%C5%81%10%7D");
  expect(cert0.certName.issuerId).toEqualComponent("ndn");
  expect(cert0.certName.version).toEqualComponent("%FD%00%00%01%60qJQ%9B");
  expect(cert0.validity.notBefore).toEqual(new Date(1513729179000));
  expect(cert0.validity.notAfter).toEqual(new Date(1609459199000));
  expect(cert0.publicKey).toEqualUint8Array(Buffer.from(`
    MIIBSzCCAQMGByqGSM49AgEwgfcCAQEwLAYHKoZIzj0BAQIhAP////8AAAABAAAA
    AAAAAAAAAAAA////////////////MFsEIP////8AAAABAAAAAAAAAAAAAAAA////
    ///////////8BCBaxjXYqjqT57PrvVV2mIa8ZR0GsMxTsPY7zjw+J9JgSwMVAMSd
    NgiG5wSTamZ44ROdJreBn36QBEEEaxfR8uEsQkf4vOblY6RA8ncDfYEt6zOg9KE5
    RdiYwpZP40Li/hp/m47n60p8D54WK84zV2sxXs7LtkBoN79R9QIhAP////8AAAAA
    //////////+85vqtpxeehPO5ysL8YyVRAgEBA0IABAUIdqatSflni6u9XO2ZSmBA
    +MjDwkx2RiPtCCLsm4oKVn2Jyfa/yOSgZseGqnTEdbN1rDWvlIgAmxI0MUXVM1g=`, "base64"));
  const pub0 = await Certificate.loadPublicKey(cert0);
  expect(pub0).toBeInstanceOf(EcPublicKey);

  const data1 = new Decoder(NDN_TESTBED_ARIZONA_20190312).decode(Data);
  await pub0.verify(data1);
  // await expect(pub0.verify(data1)).resolves.toBeUndefined();
});
