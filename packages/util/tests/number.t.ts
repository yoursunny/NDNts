import { expect, test } from "vitest";

import { constrain } from "..";

test("constrain", () => {
  expect(constrain(0, "XXXX")).toBe(0);
  expect(constrain(1, "XXXX")).toBe(1);
  expect(() => constrain(1.8, "XXXX")).toThrow(/XXXX/);
  expect(constrain(Number.MAX_SAFE_INTEGER - 1, "XXXX")).toBe(Number.MAX_SAFE_INTEGER - 1);
  expect(constrain(Number.MAX_SAFE_INTEGER, "XXXX")).toBe(Number.MAX_SAFE_INTEGER);
  expect(() => constrain(-1, "XXXX")).toThrow(/XXXX/);
  expect(constrain(Number.MIN_SAFE_INTEGER, "XXXX", Number.MIN_SAFE_INTEGER, -1)).toBe(Number.MIN_SAFE_INTEGER);
  expect(() => constrain(Number.MAX_VALUE, "XXXX")).toThrow(/XXXX/);
  expect(constrain(Number.MAX_VALUE, "XXXX", Number.MAX_VALUE)).toBe(Number.MAX_VALUE);
  expect(constrain(-Number.MAX_VALUE, "XXXX", -Number.MAX_VALUE, Number.MAX_VALUE)).toBe(-Number.MAX_VALUE);
  expect(constrain(8, "XXXX", 8)).toBe(8);
  expect(() => constrain(9, "XXXX", 8)).toThrow(/XXXX/);
  expect(constrain(2, "XXXX", 2, 6)).toBe(2);
  expect(() => constrain(1, "XXXX", 2, 6)).toThrow(/XXXX/);
  expect(constrain(-2, "XXXX", -6, -2)).toBe(-2);
  expect(() => constrain(-1, "XXXX", -6, -2)).toThrow(/XXXX/);
});
