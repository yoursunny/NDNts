import "@ndn/packet/test-fixture/expect";

import { Name, SigType } from "@ndn/packet";
import * as TestSignVerify from "@ndn/packet/test-fixture/sign-verify";

import { Certificate, EcCurve, ECDSA, generateSigningKey, KeyChain } from "../..";

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

  const { signer, publicKey } = await keyChain.getKeyPair(name);
  expect(signer.sigType).toBe(SigType.Sha256WithEcdsa);

  const cert = await Certificate.selfSign({ privateKey: signer, publicKey });
  const verifier = await cert.createVerifier();
  expect(verifier.name).toEqualName(signer.name);
  expect(verifier.sigType).toBe(SigType.Sha256WithEcdsa);
  await expect(verifier.verify(cert.data)).resolves.toBeUndefined();
});
