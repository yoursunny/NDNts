import * as TestStore from "@ndn/keychain/test-fixture/keychain-store";
import * as TestSignVerify from "@ndn/keychain/test-fixture/sign-verify";

import { getPageUri, pageInvoke } from "../../test-fixture";
import { deserializeInBrowser } from "../../test-fixture/serialize";
import { SignVerifyTestResult } from "./api";

test("store", async () => {
  await page.goto(getPageUri(__dirname));
  const result = await pageInvoke<typeof window.testStore>(page, "testStore");
  TestStore.check(result);
});

test("SHA256", async () => {
  await page.goto(getPageUri(__dirname));
  const [rI, rD] = deserializeInBrowser(await pageInvoke<typeof window.testDigestKey>(
    page, "testDigestKey")) as SignVerifyTestResult;
  TestSignVerify.check(rI, true, true);
  TestSignVerify.check(rD, true, true);
});

test("ECDSA", async () => {
  await page.goto(getPageUri(__dirname));
  const [rI, rD] = deserializeInBrowser(await pageInvoke<typeof window.testEcKey>(
    page, "testEcKey")) as SignVerifyTestResult;
  TestSignVerify.check(rI, false, false);
  TestSignVerify.check(rD, false, false);
});
