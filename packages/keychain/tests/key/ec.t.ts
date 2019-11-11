import "@ndn/name/test-fixture";

import { SigType } from "@ndn/l3pkt";
import { Name } from "@ndn/name";

import { Certificate, EC_CURVES, EcCurve, EcPrivateKey, EcPublicKey, KeyChain,
         PrivateKey, PublicKey } from "../..";
import * as TestSignVerify from "../../test-fixture/sign-verify";

interface Row extends TestSignVerify.Row {
  curve: EcCurve;
}

const TABLE = TestSignVerify.TABLE.flatMap((row) =>
  EC_CURVES.map((curve) => ({ ...row, curve })),
) as Row[];

test.each(TABLE)("sign-verify %p", async ({ cls, curve }) => {
  const [pvtA, pubA] = await EcPrivateKey.generate("/ECKEY-A/KEY/x", curve);
  const [pvtB, pubB] = await EcPrivateKey.generate("/ECKEY-B/KEY/x", curve);

  expect(PrivateKey.isPrivateKey(pvtA)).toBeTruthy();
  expect(PrivateKey.isPrivateKey(pubA)).toBeFalsy();
  expect(PublicKey.isPublicKey(pvtA)).toBeFalsy();
  expect(PublicKey.isPublicKey(pubA)).toBeTruthy();
  expect(pvtA.name).toEqualName("/ECKEY-A/KEY/x");
  expect(pubA.name).toEqualName("/ECKEY-A/KEY/x");
  expect(pvtB.name).toEqualName("/ECKEY-B/KEY/x");
  expect(pubB.name).toEqualName("/ECKEY-B/KEY/x");

  const record = await TestSignVerify.execute(cls, pvtA, pubA, pvtB, pubB);
  TestSignVerify.check(record);
  expect(record.sA0.sigInfo.type).toBe(SigType.Sha256WithEcdsa);
  expect(record.sA0.sigInfo.keyLocator).toBeInstanceOf(Name);
  expect(record.sA0.sigInfo.keyLocator).toEqualName(pvtA.name);
});

test.each(EC_CURVES)("load %p", async (curve) => {
  const keyChain = KeyChain.createTemp();
  const name = new Name("/ECKEY/KEY/x");
  await EcPrivateKey.generate(name, curve, keyChain);

  const [pvt, pub] = await keyChain.getKeyPair(name);
  expect(pvt).toBeInstanceOf(EcPrivateKey);

  const cert = await Certificate.selfSign({ privateKey: pvt, publicKey: pub });
  const pub2 = await Certificate.loadPublicKey(cert);
  expect(pub2).toBeInstanceOf(EcPublicKey);
  expect(pub2.name).toEqualName(pvt.name);
});
