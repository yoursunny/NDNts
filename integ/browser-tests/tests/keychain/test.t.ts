import * as TestCertStore from "@ndn/keychain/test-fixture/cert-store";
import * as TestKeyStore from "@ndn/keychain/test-fixture/key-store";
import * as TestSignVerify from "@ndn/keychain/test-fixture/sign-verify";

import { getPageUri, pageInvoke } from "../../test-fixture";
import { deserializeInBrowser } from "../../test-fixture/serialize";
import { SignVerifyTestResult } from "./api";

beforeEach(() => page.goto(getPageUri(__dirname)));

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
  TestSignVerify.check(rI, true, true);
  TestSignVerify.check(rD, true, true);
});

test("ECDSA", async () => {
  const [rI, rD] = deserializeInBrowser(await pageInvoke<typeof window.testEcKey>(
    page, "testEcKey")) as SignVerifyTestResult;
  TestSignVerify.check(rI, false, false);
  TestSignVerify.check(rD, false, false);
});
