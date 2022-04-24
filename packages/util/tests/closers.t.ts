import { setTimeout as delay } from "node:timers/promises";
import { expect, test, vi } from "vitest";

import { Closers } from "..";

test("closers", async () => {
  const closers = new Closers();
  expect(closers).toHaveLength(0);

  const c0 = {
    close: vi.fn<[], void>(),
  };
  const c1 = {
    close: vi.fn<[], number>().mockReturnValue(1),
  };

  closers.push(c0, c1);
  expect(closers).toHaveLength(2);

  const { close } = closers;
  close();
  expect(closers).toHaveLength(0);
  expect(c0.close).toHaveBeenCalledTimes(1);
  expect(c1.close).toHaveBeenCalledTimes(1);

  closers.close();
  expect(closers).toHaveLength(0);
  expect(c0.close).toHaveBeenCalledTimes(1);
  expect(c1.close).toHaveBeenCalledTimes(1);

  const f2 = vi.fn<[], void>();
  const f3 = vi.fn<[], void>();
  const f4 = vi.fn<[], void>();
  closers.addTimeout(setTimeout(f2, 10));
  closers.addTimeout(setTimeout(f3, 500));
  const t4 = closers.addTimeout(setTimeout(f3, 500));
  clearTimeout(t4);
  await delay(200);
  closers.close();
  await delay(500);
  expect(closers).toHaveLength(0);
  expect(f2).toHaveBeenCalledTimes(1);
  expect(f3).toHaveBeenCalledTimes(0);
  expect(f4).toHaveBeenCalledTimes(0);
});
