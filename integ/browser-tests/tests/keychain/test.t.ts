import * as TestSignVerify from "@ndn/keychain/test-fixture/sign-verify";

import { getPageUri, pageInvoke } from "../../test-fixture";
import { deserializeInBrowser } from "../../test-fixture/serialize";

import "./api";

test("digest", async () => {
  await page.goto(getPageUri(__dirname));
  const [interestResult, dataResult] = deserializeInBrowser(await pageInvoke<typeof window.testDigestKey>(page, "testDigestKey")) as [TestSignVerify.TestRecord, TestSignVerify.TestRecord];
  TestSignVerify.check(interestResult, true, true);
  TestSignVerify.check(dataResult, true, true);
});
