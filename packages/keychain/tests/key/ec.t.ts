import "@ndn/packet/test-fixture/expect";

import { Name, SigType } from "@ndn/packet";
import * as TestSignVerify from "@ndn/packet/test-fixture/sign-verify";

import { Certificate, EcCurve, EcPrivateKey, EcPublicKey, KeyChain, PublicKey } from "../..";

interface Row extends TestSignVerify.Row {
  curve: EcCurve;
}

const TABLE = TestSignVerify.TABLE.flatMap((row) =>
  EcCurve.Choices.map((curve) => ({ ...row, curve })),
) as Row[];

test.each(TABLE)("sign-verify %p", async ({ cls, curve }) => {
  const [pvtA, pubA] = await EcPrivateKey.generate("/ECKEY-A/KEY/x", curve);
  expect(PublicKey.isExportable(pubA)).toBeTruthy();
  const [pvtB, pubB] = await EcPrivateKey.generate("/ECKEY-B/KEY/x", curve);

  expect(pvtA.name).toEqualName("/ECKEY-A/KEY/x");
  expect(pubA.name).toEqualName("/ECKEY-A/KEY/x");
  expect(pvtB.name).toEqualName("/ECKEY-B/KEY/x");
  expect(pubB.name).toEqualName("/ECKEY-B/KEY/x");

  const record = await TestSignVerify.execute(cls, pvtA, pubA, pvtB, pubB);
  TestSignVerify.check(record);
  expect(record.sA0.sigInfo.type).toBe(SigType.Sha256WithEcdsa);
  expect(record.sA0.sigInfo.keyLocator?.name).toEqualName(pvtA.name);
});

test.each(EcCurve.Choices)("load %p", async (curve) => {
  const keyChain = KeyChain.createTemp();
  const name = new Name("/ECKEY/KEY/x");
  await EcPrivateKey.generate(name, curve, keyChain);

  const [pvt, pub] = await keyChain.getKeyPair(name);
  expect(pvt).toBeInstanceOf(EcPrivateKey);

  const cert = await Certificate.selfSign({ privateKey: pvt, publicKey: pub });
  const pub2 = await cert.loadPublicKey();
  expect(pub2).toBeInstanceOf(EcPublicKey);
  expect(pub2.name).toEqualName(pvt.name);
  await expect(pub2.verify(cert.data)).resolves.toBeUndefined();
});
