import { console } from "@ndn/util";
import { expect, test } from "vitest";

import { lvstlv } from "..";
import { pyndn0, pyndn1, pyndn2 } from "../test-fixture/lvstlv";

test("pyndn0", () => {
  console.log(pyndn0.toString());
  expect(pyndn0.version).toBe(lvstlv.BinfmtVersion);
});

test("pyndn1", () => {
  console.log(pyndn1.toString());
  expect(pyndn1.version).toBe(lvstlv.BinfmtVersion);
});

test("pyndn2", () => {
  console.log(pyndn2.toString());
  expect(pyndn2.version).toBe(lvstlv.BinfmtVersion);
});
