import { expect, test } from "vitest";

import { printTT } from "..";

test("printTT", () => {
  expect(printTT(0x00)).toBe("0x00");
  expect(printTT(0xFC)).toBe("0xFC");
  expect(printTT(0xFD)).toBe("0x00FD");
  expect(printTT(0x100)).toBe("0x0100");
  expect(printTT(0xFFFF)).toBe("0xFFFF");
  expect(printTT(0x10000)).toBe("0x00010000");
  expect(printTT(0xFFFFFFFF)).toBe("0xFFFFFFFF");
});
