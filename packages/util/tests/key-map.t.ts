import { expect, test } from "vitest";

import { KeyMap, KeyMultiMap, KeyMultiSet } from "..";

type Key = [string];

function keyOf(key: Key): string {
  return key[0];
}

test("KeyMap", () => {
  const m = new KeyMap<Key, number, string>(keyOf);
  expect(m.size).toBe(0);
  expect(m.get(["A"])).toBeUndefined();
  expect(m.size).toBe(0);

  expect(m.set(["A"], 10)).toBe(m);
  expect(m.size).toBe(1);

  expect(m.get(["A"])).toBe(10);
  expect(m.get(["B"])).toBeUndefined();

  const list = Array.from(m);
  expect(list).toHaveLength(1);
  expect(list[0]![0]).toEqual(["A"]);
  expect(list[0]![1]).toBe(10);

  expect(m.delete(["A"])).toBeTruthy();
  expect(m.delete(["A"])).toBeFalsy();
  expect(m.size).toBe(0);
});

test("KeyMultiMap", () => {
  const m = new KeyMultiMap<Key, number, string>(keyOf);
  expect(m.dimension).toBe(0);
  expect(m.size).toBe(0);
  expect(m.count(["A"])).toBe(0);
  expect(m.list(["A"]).size).toBe(0);
  expect(m.dimension).toBe(0);
  expect(m.size).toBe(0);

  expect(m.add(["A"], 11)).toBe(1);
  expect(m.dimension).toBe(1);
  expect(m.size).toBe(1);
  expect(m.add(["A"], 12)).toBe(2);
  expect(m.dimension).toBe(1);
  expect(m.size).toBe(2);
  expect(m.add(["A"], 12)).toBe(2);
  expect(m.dimension).toBe(1);
  expect(m.size).toBe(2);
  expect(m.add(["B"], 21)).toBe(1);
  expect(m.dimension).toBe(2);
  expect(m.size).toBe(3);

  expect(m.count(["A"])).toBe(2);
  expect(m.list(["A"])).toEqual(new Set([11, 12]));
  expect(m.count(["B"])).toBe(1);
  expect(m.count(["C"])).toBe(0);

  const list = Array.from(m.associations());
  expect(list).toHaveLength(2);
  list.sort(([, a], [, b]) => a.size - b.size);
  expect(list[1]![0]).toEqual(["A"]);
  expect(list[1]![1]).toEqual(new Set([11, 12]));
  expect(list[0]![0]).toEqual(["B"]);
  expect(list[0]![1]).toEqual(new Set([21]));

  expect(m.remove(["A"], 10)).toBe(2);
  expect(m.dimension).toBe(2);
  expect(m.size).toBe(3);
  expect(m.remove(["A"], 11)).toBe(1);
  expect(m.dimension).toBe(2);
  expect(m.size).toBe(2);
  expect(m.remove(["A"], 12)).toBe(0);
  expect(m.dimension).toBe(1);
  expect(m.size).toBe(1);
  expect(m.remove(["A"], 12)).toBe(0);
  expect(m.dimension).toBe(1);
  expect(m.size).toBe(1);
  expect(m.remove(["B"], 21)).toBe(0);
  expect(m.dimension).toBe(0);
  expect(m.size).toBe(0);
});

test("KeyMultiSet", () => {
  const m = new KeyMultiSet<Key, string>(keyOf);
  expect(m.dimension).toBe(0);
  expect(m.size).toBe(0);
  expect(m.count(["A"])).toBe(0);
  expect(m.dimension).toBe(0);
  expect(m.size).toBe(0);

  expect(m.add(["A"])).toBe(1);
  expect(m.dimension).toBe(1);
  expect(m.size).toBe(1);
  expect(m.add(["A"])).toBe(2);
  expect(m.dimension).toBe(1);
  expect(m.size).toBe(2);
  expect(m.add(["B"])).toBe(1);
  expect(m.dimension).toBe(2);
  expect(m.size).toBe(3);

  expect(m.count(["A"])).toBe(2);
  expect(m.count(["B"])).toBe(1);
  expect(m.count(["C"])).toBe(0);

  const list = Array.from(m.multiplicities());
  expect(list).toHaveLength(2);
  list.sort(([, a], [, b]) => a - b);
  expect(list[1]![0]).toEqual(["A"]);
  expect(list[1]![1]).toBe(2);
  expect(list[0]![0]).toEqual(["B"]);
  expect(list[0]![1]).toBe(1);

  expect(m.remove(["A"])).toBe(1);
  expect(m.dimension).toBe(2);
  expect(m.size).toBe(2);
  expect(m.remove(["A"])).toBe(0);
  expect(m.dimension).toBe(1);
  expect(m.size).toBe(1);
  expect(m.remove(["A"])).toBe(0);
  expect(m.dimension).toBe(1);
  expect(m.size).toBe(1);
  expect(m.remove(["B"])).toBe(0);
  expect(m.dimension).toBe(0);
  expect(m.size).toBe(0);
});
