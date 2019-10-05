import { SigType } from "@ndn/l3pkt";
import { Name } from "@ndn/name";
import "@ndn/name/test-fixture";

import { EcCurve, EcPrivateKey, KeyChain, PrivateKey, PublicKey, ValidityPeriod } from "../../src";
import * as TestSignVerify from "../../test-fixture/sign-verify";

interface Row extends TestSignVerify.Row {
  curve: EcCurve;
}

const TABLE = TestSignVerify.TABLE.flatMap((row) => [
  Object.assign({ curve: "P-256" }, row),
  Object.assign({ curve: "P-384" }, row),
  Object.assign({ curve: "P-521" }, row),
]) as Row[];

test.each(TABLE)("%p", async ({ cls, curve }) => {
  const keyChain = KeyChain.createTemp();
  const validity = ValidityPeriod.daysFromNow(1);
  const { privateKey: pvtA, publicKey: pubA } =
    await keyChain.generateKey(EcPrivateKey, "/ECKEY-A/KEY/x", validity, curve);
  const { privateKey: pvtB, publicKey: pubB } =
    await keyChain.generateKey(EcPrivateKey, "/ECKEY-B/KEY/x", validity, curve);

  expect(PrivateKey.isPrivateKey(pvtA)).toBeTruthy();
  expect(PrivateKey.isPrivateKey(pubA)).toBeFalsy();
  expect(PublicKey.isPublicKey(pvtA)).toBeFalsy();
  expect(PublicKey.isPublicKey(pubA)).toBeTruthy();
  expect(pvtA.name).toEqualName("/ECKEY-A/KEY/x");
  expect(pubA.name).toEqualName("/ECKEY-A/KEY/x");
  expect(pvtB.name).toEqualName("/ECKEY-B/KEY/x");
  expect(pubB.name).toEqualName("/ECKEY-B/KEY/x");

  const record = await TestSignVerify.execute(cls, pvtA, pubA, pvtB, pubB);
  TestSignVerify.check(record, false, false);
  expect(record.sA0.sigInfo.type).toBe(SigType.Sha256WithEcdsa);
  expect(record.sA0.sigInfo.keyLocator).toBeInstanceOf(Name);
  expect(record.sA0.sigInfo.keyLocator).toEqualName(pvtA.name);
});
