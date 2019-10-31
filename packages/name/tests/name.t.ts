import "@ndn/tlv/test-fixture";

import { Decoder } from "@ndn/tlv";

import { Component, Name } from "../src";

test("simple", () => {
  let name = new Name();
  expect(name.length).toBe(0);
  expect(name.toString()).toBe("/");

  name = new Name("/");
  expect(name.length).toBe(0);
  expect(name.toString()).toBe("/");

  const decoder = new Decoder(Uint8Array.of(
    0x07, 0x07,
    0x08, 0x01, 0x41,
    0xF0, 0x02, 0x42, 0x43,
  ));
  name = decoder.decode(Name);
  expect(name.length).toBe(2);
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
  expect(() => name.at(2)).toThrow();
  expect(name.at(-1)).toEqual(comp1);
  expect(name.at(-2)).toEqual(comp0);
  expect(() => name.at(-3)).toThrow();
});

test("modify", () => {
  const name = new Name("/A/B/C");
  expect(new Name(name).toString()).toBe("/A/B/C");
  expect(name.slice(1).toString()).toBe("/B/C");
  expect(name.getPrefix(-1).toString()).toBe("/A/B");
  expect(name.append("D", "E").toString()).toBe("/A/B/C/D/E");
  expect(name.replaceAt(1, "BB").toString()).toBe("/A/BB/C");
  expect(name.replaceAt(-1, "CC").toString()).toBe("/A/B/CC");
  expect(name.toString()).toBe("/A/B/C"); // immutable
});

test("compare", () => {
  const name = new Name("/A/B");
  expect(name.compare("/A/C")).toBe(Name.CompareResult.LT);
  expect(name.compare("/A/B/C")).toBe(Name.CompareResult.LPREFIX);
  expect(name.compare("/A/B")).toBe(Name.CompareResult.EQUAL);
  expect(name.compare("/A")).toBe(Name.CompareResult.RPREFIX);
  expect(name.compare("/A/A")).toBe(Name.CompareResult.GT);

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
  ]);
});

test("encode valueOnly", () => {
  const name = new Name("/A/B");
  expect(name.valueOnly).toEncodeAs([
    0x08, 0x01, 0x41,
    0x08, 0x01, 0x42,
  ]);
});

test("NameLike", () => {
  expect(Name.isNameLike(new Name())).toBeTruthy();
  expect(Name.isNameLike("/")).toBeTruthy();
  expect(Name.isNameLike({})).toBeFalsy();
});
