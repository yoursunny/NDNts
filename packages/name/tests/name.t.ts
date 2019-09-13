import "@ndn/tlv/lib/expect"

import { Name, Component, NameCompareResult } from "../src";

test("simple", () => {
  let name = new Name();
  expect(name.size).toBe(0);
  expect(name.toString()).toBe("/");

  name = new Name(new Uint8Array([
    0x07, 0x07,
    0x08, 0x01, 0x41,
    0xF0, 0x02, 0x42, 0x43
  ]));
  expect(name.size).toBe(2);
  expect(name.get(0)).toEqual(Component.from("A"));
  expect(name.get(1)).toEqual(Component.from("240=BC"));
  expect(name.toString()).toBe("/A/240=BC");
});

test("get at", () => {
  const comp0 = Component.from("A");
  const comp1 = Component.from("B");
  const name = new Name([comp0, comp1]);

  expect(name.get(0)).toEqual(comp0);
  expect(name.get(1)).toEqual(comp1);
  expect(name.get(2)).toBeUndefined();
  expect(name.get(-1)).toEqual(comp1);
  expect(name.get(-2)).toEqual(comp0);
  expect(name.get(-3)).toBeUndefined();

  expect(name.at(0)).toEqual(comp0);
  expect(name.at(1)).toEqual(comp1);
  expect(() => { name.at(2); }).toThrow();
  expect(name.at(-1)).toEqual(comp1);
  expect(name.at(-2)).toEqual(comp0);
  expect(() => { name.at(-3); }).toThrow();
});

test("modify", () => {
  const name = new Name("/A/B/C");
  expect(new Name(name).toString()).toBe("/A/B/C");
  expect(name.slice(1).toString()).toBe("/B/C");
  expect(name.getPrefix(-1).toString()).toBe("/A/B");
  expect(name.append("D", "E").toString()).toBe("/A/B/C/D/E")
  expect(name.toString()).toBe("/A/B/C"); // immutable
});

test("compare", () => {
  const name = new Name("/A/B");
  expect(name.compare("/A/C")).toBe(NameCompareResult.LT);
  expect(name.compare("/A/B/C")).toBe(NameCompareResult.LPREFIX);
  expect(name.compare("/A/B")).toBe(NameCompareResult.EQUAL);
  expect(name.compare("/A")).toBe(NameCompareResult.RPREFIX);
  expect(name.compare("/A/A")).toBe(NameCompareResult.GT);

  expect(name.equals("/A/C")).toBeFalsy();
  expect(name.equals("/A/B/C")).toBeFalsy();
  expect(name.equals("/A/B")).toBeTruthy();
  expect(name.equals("/A")).toBeFalsy();
  expect(name.equals("/A/A")).toBeFalsy();

  expect(name.isPrefixOf("/A/C")).toBeFalsy();
  expect(name.isPrefixOf("/A/B/C")).toBeTruthy();
  expect(name.isPrefixOf("/A/B")).toBeTruthy();
  expect(name.isPrefixOf("/A")).toBeFalsy();
  expect(name.isPrefixOf("/A/A")).toBeFalsy();
});

test("encode", () => {
  const name = new Name("/A/B");
  expect(name).toEncodeAs([
    0x07, 0x06,
    0x08, 0x01, 0x41,
    0x08, 0x01, 0x42,
  ])
});
