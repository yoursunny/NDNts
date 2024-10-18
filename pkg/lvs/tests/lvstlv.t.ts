import { console } from "@ndn/util";
import { expect, test } from "vitest";

import { pyndn0, pyndn1, pyndn2 } from "../test-fixture/lvstlv";

test("pyndn0", () => {
  console.log(pyndn0.toString());
});

test("pyndn1", () => {
  console.log(pyndn1.toString());
  expect(pyndn1.nodes).toHaveLength(26);
});

test("pyndn2", () => {
  console.log(pyndn2.toString());
});
