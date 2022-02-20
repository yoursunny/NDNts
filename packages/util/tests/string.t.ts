import "../test-fixture/expect";

import { fromHex, fromUtf8, toHex, toUtf8 } from "..";

test("toHex", () => {
  expect(toHex(new Uint8Array())).toBe("");
  expect(toHex(Uint8Array.of(0x00))).toBe("00");
  expect(toHex(Uint8Array.of(0x7F))).toBe("7F");
  expect(toHex(Uint8Array.of(0xBE, 0xEF))).toBe("BEEF");
});

test("fromHex", () => {
  expect(fromHex("")).toEqualUint8Array([]);
  expect(fromHex("00")).toEqualUint8Array([0x00]);
  expect(fromHex("7F")).toEqualUint8Array([0x7F]);
  expect(fromHex("BeeF")).toEqualUint8Array([0xBE, 0xEF]);
});

test("utf8", () => {
  expect(toUtf8("A")).toEqualUint8Array([0x41]);
  expect(fromUtf8(Uint8Array.of(0x42))).toBe("B");
});
