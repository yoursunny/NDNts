import { SigType } from "@ndn/l3pkt";
import { Name } from "@ndn/name";
import "@ndn/name/test-fixture";

import { Certificate, KeyChain, PrivateKey, PublicKey, RSA_MODULUS_LENGTHS, RsaModulusLength,
         RsaPrivateKey, RsaPublicKey, ValidityPeriod } from "../../src";
import * as TestSignVerify from "../../test-fixture/sign-verify";

interface Row extends TestSignVerify.Row {
  modulusLength: RsaModulusLength;
}

const TABLE = TestSignVerify.TABLE.flatMap((row) =>
  RSA_MODULUS_LENGTHS.map((modulusLength) => ({ ...row, modulusLength })),
) as Row[];

test.each(TABLE)("sign-verify %p", async ({ cls, modulusLength }) => {
  const keyChain = KeyChain.createTemp();
  const validity = ValidityPeriod.daysFromNow(1);
  const { privateKey: pvtA, publicKey: pubA } =
    await keyChain.generateKey(RsaPrivateKey, "/RSAKEY-A/KEY/x", validity, modulusLength);
  const { privateKey: pvtB, publicKey: pubB } =
    await keyChain.generateKey(RsaPrivateKey, "/RSAKEY-B/KEY/x", validity, modulusLength);

  expect(PrivateKey.isPrivateKey(pvtA)).toBeTruthy();
  expect(PrivateKey.isPrivateKey(pubA)).toBeFalsy();
  expect(PublicKey.isPublicKey(pvtA)).toBeFalsy();
  expect(PublicKey.isPublicKey(pubA)).toBeTruthy();
  expect(pvtA.name).toEqualName("/RSAKEY-A/KEY/x");
  expect(pubA.name).toEqualName("/RSAKEY-A/KEY/x");
  expect(pvtB.name).toEqualName("/RSAKEY-B/KEY/x");
  expect(pubB.name).toEqualName("/RSAKEY-B/KEY/x");

  const record = await TestSignVerify.execute(cls, pvtA, pubA, pvtB, pubB);
  TestSignVerify.check(record, true, false);
  expect(record.sA0.sigInfo.type).toBe(SigType.Sha256WithRsa);
  expect(record.sA0.sigInfo.keyLocator).toBeInstanceOf(Name);
  expect(record.sA0.sigInfo.keyLocator).toEqualName(pvtA.name);
});

test.each(RSA_MODULUS_LENGTHS)("import %p", async (modulusLength) => {
  const keyChain = KeyChain.createTemp();
  const validity = ValidityPeriod.daysFromNow(1);
  const { publicKey, selfSigned } = await keyChain.generateKey(RsaPrivateKey, "/RSAKEY/KEY/x", validity, modulusLength);

  const pvt = await keyChain.getKey(new Name("/RSAKEY/KEY/x"));
  expect(pvt).toBeInstanceOf(RsaPrivateKey);

  const pub = await Certificate.getPublicKey(selfSigned);
  expect(pub).toBeInstanceOf(RsaPublicKey);
  expect(pub.name).toEqualName(publicKey.name);
});
