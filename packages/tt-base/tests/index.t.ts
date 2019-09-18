import { TT } from "../src";

test("toString", () => {
  expect(TT.toString(TT.Interest)).toBe("Interest");
  expect(TT.toString(0x05)).toBe("Interest");

  expect(TT.toString(0x00)).toBe("0x00");
  expect(TT.toString(0xF0)).toBe("0xF0");
  expect(TT.toString(0x0100)).toBe("0x0100");
});
