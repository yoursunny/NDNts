import { expect, test, vi } from "vitest";
import { Mutex } from "wait-your-turn";

import { Closer, Closers, delay, lock } from "..";

test("closers", async () => {
  const closers = new Closers();
  expect(closers).toHaveLength(0);

  const c0 = {
    close: vi.fn<() => void>(),
  };
  const c1 = {
    close: vi.fn<() => number>().mockReturnValue(1),
  };
  closers.push(c0, c1);
  expect(closers).toHaveLength(2);

  const { close } = closers;
  close();
  expect(closers).toHaveLength(0);
  expect(c0.close).toHaveBeenCalledOnce();
  expect(c1.close).toHaveBeenCalledOnce();

  const waitFulfilled = vi.fn<() => void>();
  void closers.wait().then(waitFulfilled); // eslint-disable-line promise/prefer-await-to-then
  expect(closers).toHaveLength(1);

  closers.close();
  expect(closers).toHaveLength(0);
  expect(c0.close).toHaveBeenCalledOnce();
  expect(c1.close).toHaveBeenCalledOnce();
  await delay(10);
  expect(waitFulfilled).toHaveBeenCalledOnce();

  const f2 = vi.fn<() => void>();
  const f3 = vi.fn<() => void>();
  const f4 = vi.fn<() => void>();
  closers.addTimeout(setTimeout(f2, 10));
  closers.addTimeout(setTimeout(f3, 500));
  const t4 = closers.addTimeout(setTimeout(f3, 500));
  clearTimeout(t4);
  await delay(200);
  closers.close();
  await delay(500);
  expect(closers).toHaveLength(0);
  expect(f2).toHaveBeenCalledOnce();
  expect(f3).not.toHaveBeenCalled();
  expect(f4).not.toHaveBeenCalled();
});

test("disposable", () => {
  const c0 = {
    close: vi.fn<() => void>(),
    [Symbol.dispose]: vi.fn<() => void>(),
    [Symbol.asyncDispose]: vi.fn<() => Promise<void>>().mockResolvedValue(),
  };
  const c1 = {
    [Symbol.dispose]: vi.fn<() => void>(),
    [Symbol.asyncDispose]: vi.fn<() => Promise<void>>().mockResolvedValue(),
  };
  const c2 = {
    [Symbol.asyncDispose]: vi.fn<() => Promise<void>>().mockResolvedValue(),
  };

  {
    using closers = new Closers();
    closers.push(c0, c1, c2);
  }

  expect(c0.close).toHaveBeenCalledOnce();
  expect(c0[Symbol.dispose]).not.toHaveBeenCalled();
  expect(c0[Symbol.asyncDispose]).not.toHaveBeenCalled();
  expect(c1[Symbol.dispose]).toHaveBeenCalledOnce();
  expect(c1[Symbol.asyncDispose]).not.toHaveBeenCalled();
  expect(c2[Symbol.asyncDispose]).toHaveBeenCalledOnce();
});

test("asAsyncDisposable", async () => {
  const c0 = {
    close: vi.fn<() => void>(),
  };
  {
    await using d0 = Closer.asAsyncDisposable(c0);
  }
  expect(c0.close).toHaveBeenCalledOnce();

  const c1 = {
    [Symbol.dispose]: vi.fn<() => void>(),
  };
  {
    await using d1 = Closer.asAsyncDisposable(c1);
  }
  expect(c1[Symbol.dispose]).toHaveBeenCalledOnce();

  const c2 = {
    [Symbol.asyncDispose]: vi.fn<() => Promise<void>>().mockResolvedValue(),
  };
  {
    await using d2 = Closer.asAsyncDisposable(c2);
    expect(d2).toBe(c2);
  }
  expect(c2[Symbol.asyncDispose]).toHaveBeenCalledOnce();
});

test("lock", async () => {
  const mutex = new Mutex();
  await expect(Promise.allSettled(Array.from({ length: 20 }, async (v, i) => {
    void v;
    await delay(100 * Math.random());
    using locked = await lock(mutex);
    await delay(100 * Math.random());

    if (i % 4 === 0) {
      throw new Error("4");
    }
  }))).resolves.toHaveLength(20);
});
