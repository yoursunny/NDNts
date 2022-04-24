import { expect, test } from "vitest";

import { TcpCubic } from "..";

test("TcpCubic", () => {
  const ca = new TcpCubic();
  let now = 1624060800000;

  // slow start
  for (let i = 0; i < 98; ++i) {
    ca.increase(now, 100);
    now += 5;
  }
  expect(ca.cwnd).toBeCloseTo(100);

  // enter congestion avoidance
  ca.decrease(now);
  expect(ca.cwnd).toBeCloseTo(70);
  now += 5;

  // increase window
  const firstCwnd = ca.cwnd;
  let lastCwnd = firstCwnd;
  for (let i = 0; i < 1000; ++i) {
    ca.increase(now, 100);
    const thisCwnd = ca.cwnd;
    expect(thisCwnd).toBeGreaterThanOrEqual(lastCwnd);
    lastCwnd = thisCwnd;
    now += 5;
  }
  expect(lastCwnd).toBeGreaterThan(firstCwnd);

  // decrease window
  ca.decrease(now);
  expect(ca.cwnd).toBeLessThan(lastCwnd);
});
