import pushable from "it-pushable";
import { setTimeout as delay } from "node:timers/promises";
import { collect } from "streaming-iterables";

import { flatMapOnce, safeIter } from "..";

test("safeIter ignore", async () => {
  const it = pushable<number>();
  const collector = collect(safeIter(it));

  it.push(1);
  it.push(2); // eslint-disable-line unicorn/no-array-push-push
  await delay(10);
  it.end(new Error("X"));
  it.push(3);

  const a = await collector;
  expect(a).toEqual([1, 2]);
});

test("safeIter catch", async () => {
  const it = pushable<number>();
  const onError = jest.fn<undefined, [unknown]>();
  const collector = collect(safeIter(it, onError));

  it.push(1);
  it.push(2); // eslint-disable-line unicorn/no-array-push-push
  await delay(10);
  it.end(new Error("X"));
  it.push(3);

  const a = await collector;
  expect(a).toEqual([1, 2]);
  expect(onError).toHaveBeenCalledTimes(1);
});

test("flatMapOnce", async () => {
  const it = pushable<number>();
  it.push(1);
  it.push(2); // eslint-disable-line unicorn/no-array-push-push
  it.push(3); // eslint-disable-line unicorn/no-array-push-push
  it.push(4); // eslint-disable-line unicorn/no-array-push-push
  it.end();

  const a = await collect(flatMapOnce((n): Array<number | number[]> => {
    if (n % 2 === 0) {
      return [n];
    }
    return [[n]];
  }, it));
  expect(a).toEqual([[1], 2, [3], 4]);
});
