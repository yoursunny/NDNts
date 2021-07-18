import "@ndn/packet/test-fixture/expect";

import { EcCurve, RsaModulusLength } from "@ndn/keychain";
import * as TestCertStore from "@ndn/keychain/test-fixture/cert-store";
import * as TestKeyStore from "@ndn/keychain/test-fixture/key-store";
import { SafeBagEC, SafeBagRSA } from "@ndn/ndnsec/test-fixture/safe-bag";
import { Name } from "@ndn/packet";
import * as TestSignVerify from "@ndn/packet/test-fixture/sign-verify";

import { navigateToPage, pageInvoke } from "../../test-fixture/pptr";
import * as Serialize from "../../test-fixture/serialize";

beforeEach(() => navigateToPage(__dirname));

test("KeyStore", async () => {
  const result = await pageInvoke<typeof window.testKeyStore>(page, "testKeyStore");
  TestKeyStore.check(result);
});

test("CertStore", async () => {
  const result = await pageInvoke<typeof window.testCertStore>(page, "testCertStore");
  TestCertStore.check(result);
});

test("SHA256", async () => {
  const [rI, rD] = Serialize.parse(
    await pageInvoke<typeof window.testDigestSigning>(page, "testDigestSigning"));
  TestSignVerify.check(rI, { deterministic: true, sameAB: true });
  TestSignVerify.check(rD, { deterministic: true, sameAB: true });
});

test.each(EcCurve.Choices)("ECDSA %p", async (curve) => {
  const [rI, rD] = Serialize.parse(
    await pageInvoke<typeof window.testECDSA>(page, "testECDSA", curve));
  TestSignVerify.check(rI);
  TestSignVerify.check(rD);
});

test.each(RsaModulusLength.Choices)("RSA %p", async (modulusLength) => {
  const [rI, rD] = Serialize.parse(
    await pageInvoke<typeof window.testRSA>(page, "testRSA", modulusLength));
  TestSignVerify.check(rI, { deterministic: true });
  TestSignVerify.check(rD, { deterministic: true });
});

test("HMAC", async () => {
  const [rI, rD] = Serialize.parse(
    await pageInvoke<typeof window.testHMAC>(page, "testHMAC"));
  TestSignVerify.check(rI, { deterministic: true });
  TestSignVerify.check(rD, { deterministic: true });
});

test.each([
  SafeBagEC, SafeBagRSA,
])("import %#", async ({ sigType, certName, wire, passphrase }) => {
  const [aSigType, aCertName] =
    await pageInvoke<typeof window.testSafeBag>(page, "testSafeBag", Serialize.stringify(wire), passphrase);
  expect(aSigType).toBe(sigType);
  expect(new Name(aCertName)).toEqualName(certName);
});
