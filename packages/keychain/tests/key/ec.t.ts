import { SigType } from "@ndn/l3pkt";
import { Name } from "@ndn/name";

import { EcCurve, EcPrivateKey, PrivateKey, PublicKey } from "../../src";
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
  const [pvtA, pubA] = await EcPrivateKey.generate("/ECKEY-A/KEY/x", curve);
  const [pvtB, pubB] = await EcPrivateKey.generate("/ECKEY-B/KEY/x", curve);
  expect(PrivateKey.isPrivateKey(pvtA)).toBeTruthy();
  expect(PrivateKey.isPrivateKey(pubA)).toBeFalsy();
  expect(PublicKey.isPublicKey(pvtA)).toBeFalsy();
  expect(PublicKey.isPublicKey(pubA)).toBeTruthy();
  expect(pvtA.name.toString()).toBe("/ECKEY-A/KEY/x");
  expect(pubA.name.toString()).toBe("/ECKEY-A/KEY/x");
  expect(pvtB.name.toString()).toBe("/ECKEY-B/KEY/x");
  expect(pubB.name.toString()).toBe("/ECKEY-B/KEY/x");

  const record = await TestSignVerify.execute(cls, pvtA, pubA, pvtB, pubB);
  TestSignVerify.check(record, false, false);
  expect(record.sA0.sigInfo.type).toBe(SigType.Sha256WithEcdsa);
  expect(record.sA0.sigInfo.keyLocator).toBeInstanceOf(Name);
  expect((record.sA0.sigInfo.keyLocator as Name).toString()).toBe(pvtA.name.toString());
});
