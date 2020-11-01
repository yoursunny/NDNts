import { EcCurve, RsaModulusLength } from "@ndn/keychain";
import * as TestCertStore from "@ndn/keychain/test-fixture/cert-store";
import * as TestKeyStore from "@ndn/keychain/test-fixture/key-store";
import * as TestSignVerify from "@ndn/packet/test-fixture/sign-verify";

import { navigateToPage, pageInvoke } from "../../test-fixture/pptr";
import { deserializeInBrowser } from "../../test-fixture/serialize";
import type { SignVerifyTestResult } from "./api";

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
  const [rI, rD] = deserializeInBrowser(await pageInvoke<typeof window.testDigestSigning>(
    page, "testDigestSigning")) as SignVerifyTestResult;
  TestSignVerify.check(rI, { deterministic: true, sameAB: true });
  TestSignVerify.check(rD, { deterministic: true, sameAB: true });
});

test.each(EcCurve.Choices)("ECDSA %p", async (curve) => {
  const [rI, rD] = deserializeInBrowser(await pageInvoke<typeof window.testECDSA>(
    page, "testECDSA", curve)) as SignVerifyTestResult;
  TestSignVerify.check(rI);
  TestSignVerify.check(rD);
});

test.each(RsaModulusLength.Choices)("RSA %p", async (modulusLength) => {
  const [rI, rD] = deserializeInBrowser(await pageInvoke<typeof window.testRSA>(
    page, "testRSA", modulusLength)) as SignVerifyTestResult;
  TestSignVerify.check(rI, { deterministic: true });
  TestSignVerify.check(rD, { deterministic: true });
});

test("HMAC", async () => {
  const [rI, rD] = deserializeInBrowser(await pageInvoke<typeof window.testHMAC>(
    page, "testHMAC")) as SignVerifyTestResult;
  TestSignVerify.check(rI, { deterministic: true });
  TestSignVerify.check(rD, { deterministic: true });
});
