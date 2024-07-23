import { expect, test, vi } from "vitest";

import { TcpCubic } from "..";

test("TcpCubic", () => {
  const ca = new TcpCubic();
  let now = 1624060800000;

  const cwndupdate = vi.fn<(evt: Event) => void>();
  ca.addEventListener("cwndupdate", cwndupdate);

  // slow start
  for (let i = 0; i < 98; ++i) {
    ca.increase(now, 99.5 + Math.random());
    now += 5;
  }
  expect(ca.cwnd).toBeCloseTo(100);

  // ignore rtt=0 sample
  ca.increase(now, 0);
  now += 5;

  // enter congestion avoidance
  ca.decrease(now);
  expect(ca.cwnd).toBeCloseTo(70);
  now += 5;

  // ignore rtt=0 sample
  ca.increase(now, 0);
  now += 5;

  // increase window
  const firstCwnd = ca.cwnd;
  let lastCwnd = firstCwnd;
  for (let i = 0; i < 1000; ++i) {
    ca.increase(now, 99.5 + Math.random());
    const thisCwnd = ca.cwnd;
    expect(thisCwnd).toBeGreaterThanOrEqual(lastCwnd);
    lastCwnd = thisCwnd;
    now += 5;
  }
  expect(lastCwnd).toBeGreaterThan(firstCwnd);

  // decrease window
  ca.decrease(now);
  expect(ca.cwnd).toBeLessThan(lastCwnd);

  // rtt=0 samples should not trigger cwndupdate
  expect(cwndupdate).toHaveBeenCalledTimes(98 + 1 + 1000 + 1);
});
