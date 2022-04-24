import "../test-fixture/expect";

import { expect, test } from "vitest";

import { fromHex, sha256, timingSafeEqual, toUtf8 } from "..";

test("timingSafeEqual", () => {
  const ab = new ArrayBuffer(10);
  new Uint8Array(ab).set([0xA0, 0xA1, 0xA2, 0xA3, 0xA4, 0x05, 0xA0, 0xA1, 0xA2, 0xA3]);
  expect(timingSafeEqual(new Uint8Array(ab), new Uint8Array(ab))).toBeTruthy();
  expect(timingSafeEqual(new Uint8Array(ab), new Uint8Array(ab, 1))).toBeFalsy();
  expect(timingSafeEqual(new Uint8Array(ab, 0, 4), new Uint8Array(ab, 6))).toBeTruthy();
  expect(timingSafeEqual(new Uint8Array(ab, 0, 4), new Uint8Array(ab, 1, 4))).toBeFalsy();
});

test("sha256", async () => {
  await expect(sha256(new Uint8Array())).resolves
    .toEqualUint8Array(fromHex("E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855"));
  await expect(sha256(toUtf8("abc"))).resolves
    .toEqualUint8Array(fromHex("BA7816BF8F01CFEA414140DE5DAE2223B00361A396177A9CB410FF61F20015AD"));
});
