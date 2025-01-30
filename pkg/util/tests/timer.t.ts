import { expect, test } from "vitest";

import { randomJitter } from "..";

test.each([
  ["randomJitter", () => randomJitter(0.1, 2), 1.8, 2.2, 2],
  ["randomJitter.between", () => randomJitter.between(300, 500), 300, 500, 400],
])("%s random", { retry: 5 }, (desc, gen, min, max, thres) => {
  void desc;
  const g = gen();
  let below = 0;
  let above = 0;
  for (let i = 0; i < 100; ++i) {
    const v = g();
    expect(v).toBeGreaterThanOrEqual(min);
    expect(v).toBeLessThanOrEqual(max);
    if (v < thres) {
      ++below;
    } else {
      ++above;
    }
  }
  expect(below).toBeGreaterThan(20);
  expect(above).toBeGreaterThan(20);
});

test.each([
  ["randomJitter", () => randomJitter(0), 1],
  ["randomJitter.between", () => randomJitter.between(2, 2), 2],
])("%s fixed", (desc, gen, value) => {
  void desc;
  const g = gen();
  for (let i = 0; i < 100; ++i) {
    const v = g();
    expect(v).toBe(value);
  }
});
