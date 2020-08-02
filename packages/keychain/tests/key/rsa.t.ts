import "@ndn/packet/test-fixture/expect";

import { Name, SigType } from "@ndn/packet";
import * as TestSignVerify from "@ndn/packet/test-fixture/sign-verify";

import { Certificate, generateSigningKey, KeyChain, RSA, RsaModulusLength } from "../..";

interface Row extends TestSignVerify.Row {
  modulusLength: RsaModulusLength;
}

const TABLE = TestSignVerify.TABLE.flatMap((row) =>
  RsaModulusLength.Choices.map((modulusLength) => ({ ...row, modulusLength })),
) as Row[];

test.each(TABLE)("sign-verify %p", async ({ cls, modulusLength }) => {
  const [pvtA, pubA] = await generateSigningKey("/RSAKEY-A/KEY/x", RSA, { modulusLength });
  const [pvtB, pubB] = await generateSigningKey("/RSAKEY-B/KEY/x", RSA, { modulusLength });

  expect(pvtA.name).toEqualName("/RSAKEY-A/KEY/x");
  expect(pubA.name).toEqualName("/RSAKEY-A/KEY/x");
  expect(pvtB.name).toEqualName("/RSAKEY-B/KEY/x");
  expect(pubB.name).toEqualName("/RSAKEY-B/KEY/x");

  const record = await TestSignVerify.execute(cls, pvtA, pubA, pvtB, pubB);
  TestSignVerify.check(record, { deterministic: true });
  expect(record.sA0.sigInfo.type).toBe(SigType.Sha256WithRsa);
  expect(record.sA0.sigInfo.keyLocator?.name).toEqualName(pvtA.name);
});

test.each(RsaModulusLength.Choices)("load %p", async (modulusLength) => {
  const keyChain = KeyChain.createTemp();
  const name = new Name("/RSAKEY/KEY/x");
  await generateSigningKey(keyChain, name, RSA, { modulusLength });

  const { signer, publicKey } = await keyChain.getKeyPair(name);
  expect(signer.sigType).toBe(SigType.Sha256WithRsa);

  const cert = await Certificate.selfSign({ privateKey: signer, publicKey });
  const verifier = await cert.createVerifier();
  expect(verifier.name).toEqualName(signer.name);
  expect(verifier.sigType).toBe(SigType.Sha256WithRsa);
  await expect(verifier.verify(cert.data)).resolves.toBeUndefined();
});
