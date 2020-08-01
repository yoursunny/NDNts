import "@ndn/packet/test-fixture/expect";

import { Name, SigType } from "@ndn/packet";
import * as TestSignVerify from "@ndn/packet/test-fixture/sign-verify";

import { Certificate, EcCurve, ECDSA, generateSigningKey, KeyChain, PublicKey } from "../..";

interface Row extends TestSignVerify.Row {
  curve: EcCurve;
}

const TABLE = TestSignVerify.TABLE.flatMap((row) =>
  EcCurve.Choices.map((curve) => ({ ...row, curve })),
) as Row[];

test.each(TABLE)("sign-verify %p", async ({ cls, curve }) => {
  const [pvtA, pubA] = await generateSigningKey("/ECKEY-A/KEY/x", ECDSA, { curve });
  const [pvtB, pubB] = await generateSigningKey("/ECKEY-B/KEY/x", ECDSA, { curve });

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
  await generateSigningKey(keyChain, name, ECDSA, { curve });

  const [pvt, pub] = await keyChain.getKeyPair(name);
  expect(pvt.sigType).toBe(SigType.Sha256WithEcdsa);

  const cert = await Certificate.selfSign({ privateKey: pvt, publicKey: pub as PublicKey });
  const pub2 = await cert.createVerifier();
  expect(pub2.name).toEqualName(pvt.name);
  expect(pub2.sigType).toBe(SigType.Sha256WithEcdsa);
  await expect(pub2.verify(cert.data)).resolves.toBeUndefined();
});
