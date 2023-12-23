import { expect, test } from "vitest";

import { Reorder } from "..";

test("reorder", () => {
  const reorder = new Reorder<string>(4);
  expect(reorder.size).toBe(0);
  expect(reorder.empty).toBeTruthy();

  reorder.push(3, "3");
  expect(reorder.size).toBe(0);

  reorder.push(4, "4");
  expect(reorder.size).toBe(1);
  expect(reorder.shift()).toEqual(["4"]);
  expect(reorder.size).toBe(0);

  reorder.push(6, "6");
  reorder.push(7, "7");
  reorder.push(8, "8");
  expect(reorder.size).toBe(3);
  expect(reorder.shift()).toEqual([]);
  expect(reorder.size).toBe(3);

  reorder.push(5, "5");
  expect(reorder.size).toBe(4);
  expect(reorder.empty).toBeFalsy();
  expect(reorder.shift()).toEqual(["5", "6", "7", "8"]);
  expect(reorder.size).toBe(0);
  expect(reorder.empty).toBeTruthy();
});
