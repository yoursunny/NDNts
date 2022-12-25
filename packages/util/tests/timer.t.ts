import "../test-fixture/expect";

import { expect, test } from "vitest";

import { randomJitter } from "..";

test("randomJitter", () => {
  const jitter = randomJitter(0.1, 2);
  let below = 0;
  let above = 0;
  for (let i = 0; i < 100; ++i) {
    const v = jitter();
    expect(v).toBeGreaterThanOrEqual(1.8);
    expect(v).toBeLessThanOrEqual(2.2);
    if (v < 2) {
      ++below;
    } else {
      ++above;
    }
  }
  expect(below).toBeGreaterThan(20);
  expect(above).toBeGreaterThan(20);
});
