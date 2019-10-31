import "@ndn/tlv/test-fixture";

import { Decoder } from "@ndn/tlv";

import { ValidityPeriod } from "../../src";

test("encode decode", () => {
  const wire = [
    0xFD, 0x00, 0xFD, 0x26,
    0xFD, 0x00, 0xFE, 0x0F, // 20181113T085849
    0x32, 0x30, 0x31, 0x38, 0x31, 0x31, 0x31, 0x33, 0x54, 0x30, 0x38, 0x35, 0x38, 0x34, 0x39,
    0xFD, 0x00, 0xFF, 0x0F, // 20201011T163803
    0x32, 0x30, 0x32, 0x30, 0x31, 0x30, 0x31, 0x31, 0x54, 0x31, 0x36, 0x33, 0x38, 0x30, 0x33,
  ];

  let vp = new ValidityPeriod(new Date(1542099529000), new Date(1602434283000));
  expect(vp).toEncodeAs(wire);

  vp = new Decoder(Uint8Array.from(wire)).decode(ValidityPeriod);
  expect(vp.notBefore).toEqual(new Date(1542099529000));
  expect(vp.notAfter).toEqual(new Date(1602434283000));

  // replace 'T' with 'A'
  const decoder = new Decoder(Uint8Array.from(wire).map((ch) => ch === 0x54 ? 0x41 : ch));
  expect(() => decoder.decode(ValidityPeriod)).toThrow(/invalid/);
});

test("includes", () => {
  let vp = new ValidityPeriod(new Date(1542099529000), new Date(1602434283000));
  expect(vp.includes(new Date(1083820612000))).toBeFalsy();
  expect(vp.includes(new Date(1569790373000))).toBeTruthy();
  expect(vp.includes(new Date(1927427784000))).toBeFalsy();

  vp = new ValidityPeriod();
  expect(vp.includes(new Date(1083820612000))).toBeFalsy();
  expect(vp.includes(new Date(1569790373000))).toBeFalsy();
  expect(vp.includes(new Date(1927427784000))).toBeFalsy();
});
