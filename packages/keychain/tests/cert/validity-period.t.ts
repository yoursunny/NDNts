import "@ndn/tlv/test-fixture/expect";

import { Decoder } from "@ndn/tlv";
import { expect, test } from "vitest";

import { ValidityPeriod } from "../..";

test("encode decode", () => {
  const wire = [
    0xFD, 0x00, 0xFD, 0x26,
    0xFD, 0x00, 0xFE, 0x0F, // 20181113T085849
    0x32, 0x30, 0x31, 0x38, 0x31, 0x31, 0x31, 0x33, 0x54, 0x30, 0x38, 0x35, 0x38, 0x34, 0x39,
    0xFD, 0x00, 0xFF, 0x0F, // 20201011T163803
    0x32, 0x30, 0x32, 0x30, 0x31, 0x30, 0x31, 0x31, 0x54, 0x31, 0x36, 0x33, 0x38, 0x30, 0x33,
  ];

  const vp1 = new ValidityPeriod(new Date(1542099529000), 1602434283000);
  expect(vp1).toEncodeAs(wire);
  expect(vp1.toString()).toBe("20181113T085849-20201011T163803");

  const vp2 = new Decoder(Uint8Array.from(wire)).decode(ValidityPeriod);
  expect(vp2.notBefore).toBe(1542099529000);
  expect(vp2.notAfter).toBe(1602434283000);
  expect(vp2.equals(vp1)).toBeTruthy();

  vp2.notAfter = 1581489000000;
  expect(vp2.equals(vp1)).toBeFalsy();

  // replace 'T' with 'A'
  const decoder = new Decoder(Uint8Array.from(wire).map((ch) => ch === 0x54 ? 0x41 : ch));
  expect(() => decoder.decode(ValidityPeriod)).toThrow(/invalid/);
});

test("includes", () => {
  let vp = new ValidityPeriod(1542099529000, 1602434283000);
  expect(vp.includes(new Date(1083820612000))).toBeFalsy();
  expect(vp.includes(1569790373000)).toBeTruthy();
  expect(vp.includes(1927427784000)).toBeFalsy();

  vp = new ValidityPeriod();
  expect(vp.includes(1083820612000)).toBeFalsy();
  expect(vp.includes(1569790373000)).toBeFalsy();
  expect(vp.includes(1927427784000)).toBeFalsy();
});

test("intersect", () => {
  let vp = new ValidityPeriod(1542099529000, 1602434283000);
  vp = vp.intersect(
    new ValidityPeriod(1543017600000, 1609372800000),
    ValidityPeriod.MAX,
  );
  expect(vp.notBefore).toBe(1543017600000);
  expect(vp.notAfter).toBe(1602434283000);
});
