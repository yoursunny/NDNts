import { SigType } from "@ndn/l3pkt";

import { PrivateKey, PublicKey, theDigestKey } from "../../src";
import * as TestSignVerify from "../../test-fixture/sign-verify";

test("isKey", () => {
  expect(PrivateKey.isPrivateKey(theDigestKey)).toBeTruthy();
  expect(PublicKey.isPublicKey(theDigestKey)).toBeTruthy();
});

test.each(TestSignVerify.TABLE)("simple %#", async ({ cls }) => {
  const record = await TestSignVerify.execute(cls, theDigestKey, theDigestKey, theDigestKey, theDigestKey);
  TestSignVerify.check(record, true, true);
  expect(record.sA0.sigInfo.type).toBe(SigType.Sha256);
  expect(record.sA0.sigInfo.keyLocator).toBeUndefined();
});
