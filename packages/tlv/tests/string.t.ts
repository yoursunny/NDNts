import { toHex } from "../src";

test("toHex", () => {
  expect(toHex(new Uint8Array())).toBe("");
  expect(toHex(new Uint8Array([0x00]))).toBe("00");
  expect(toHex(new Uint8Array([0x7F]))).toBe("7F");
  expect(toHex(new Uint8Array([0xBE, 0xEF]))).toBe("BEEF");
});
