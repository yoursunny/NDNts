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
  const [pvtA, pubA] = await EcPrivateKey.generate("/ECKEY-A", curve);
  const [pvtB, pubB] = await EcPrivateKey.generate("/ECKEY-B", curve);
  expect(PrivateKey.isPrivateKey(pvtA)).toBeTruthy();
  expect(PrivateKey.isPrivateKey(pubA)).toBeFalsy();
  expect(PublicKey.isPublicKey(pvtA)).toBeFalsy();
  expect(PublicKey.isPublicKey(pubA)).toBeTruthy();

  const record = await TestSignVerify.execute(cls, pvtA, pubA, pvtB, pubB);
  TestSignVerify.check(record, false, false);
  expect(record.sA0.sigInfo.type).toBe(SigType.Sha256WithEcdsa);
  expect(record.sA0.sigInfo.keyLocator).toBeInstanceOf(Name);
  expect((record.sA0.sigInfo.keyLocator as Name).toString()).toBe("/ECKEY-A");
});
