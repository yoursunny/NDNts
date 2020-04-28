import * as TestCertStore from "@ndn/keychain/test-fixture/cert-store";
import * as TestKeyStore from "@ndn/keychain/test-fixture/key-store";
import * as TestSignVerify from "@ndn/keychain/test-fixture/sign-verify";

import { navigateToPage, pageInvoke } from "../../test-fixture/pptr";
import { deserializeInBrowser } from "../../test-fixture/serialize";
import { SignVerifyTestResult } from "./api";

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
  const [rI, rD] = deserializeInBrowser(await pageInvoke<typeof window.testDigestKey>(
    page, "testDigestKey")) as SignVerifyTestResult;
  TestSignVerify.check(rI, { deterministic: true, sameAB: true });
  TestSignVerify.check(rD, { deterministic: true, sameAB: true });
});

test("ECDSA", async () => {
  const [rI, rD] = deserializeInBrowser(await pageInvoke<typeof window.testEcKey>(
    page, "testEcKey")) as SignVerifyTestResult;
  TestSignVerify.check(rI);
  TestSignVerify.check(rD);
});

test("RSA", async () => {
  const [rI, rD] = deserializeInBrowser(await pageInvoke<typeof window.testRsaKey>(
    page, "testRsaKey")) as SignVerifyTestResult;
  TestSignVerify.check(rI, { deterministic: true });
  TestSignVerify.check(rD, { deterministic: true });
});

test("HMAC", async () => {
  const [rI, rD] = deserializeInBrowser(await pageInvoke<typeof window.testHmacKey>(
    page, "testHmacKey")) as SignVerifyTestResult;
  TestSignVerify.check(rI, { deterministic: true, alwaysMatch: true });
  TestSignVerify.check(rD, { deterministic: true, alwaysMatch: true });
});
