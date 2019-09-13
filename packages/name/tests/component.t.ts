import "@ndn/tlv/lib/expect";

import { Component, ComponentCompareResult } from "../src";

test("simple decode", () => {
  let comp = new Component();
  expect(comp.type).toBe(0x08);
  expect(comp.value).toEqualUint8Array([]);
  expect(comp.toString()).toEqual("...")

  comp = new Component(new Uint8Array([0xF0, 0x03, 0x41, 0x01, 0xA0]));
  expect(comp.type).toBe(0xF0);
  expect(comp.value).toEqualUint8Array([0x41, 0x01, 0xA0]);
  expect(comp.toString()).toEqual("240=A%01%a0")

  comp = new Component(0xFFFF, new Uint8Array([0x41]));
  expect(comp.type).toBe(0xFFFF);
  expect(comp.value).toEqualUint8Array([0x41]);
  expect(comp.toString()).toEqual("65535=A")
});

test("error on decode TLV-TYPE out of range", () => {
  expect(() => {
    new Component(0x00);
  }).toThrow();

  expect(() => {
    new Component(0x10000);
  }).toThrow();

  expect(() => {
    new Component(new Uint8Array([0x00, 0x01, 0x41]));
  }).toThrow();

  expect(() => {
    new Component(new Uint8Array([0xFE, 0x00, 0x01, 0x00, 0x00, 0x01, 0x41]));
  }).toThrow();
});

test("from URI", () => {
  let comp = Component.from("A");
  expect(comp.type).toBe(0x08);
  expect(comp.value).toEqualUint8Array([0x41]);

  comp = Component.from("20=A%00B");
  expect(comp.type).toBe(0x14);
  expect(comp.value).toEqualUint8Array([0x41, 0x00, 0x42]);

  comp = Component.from(".....");
  expect(comp.type).toBe(0x08);
  expect(comp.value).toEqualUint8Array([0x2E, 0x2E]);

  comp = Component.from("36=%0f%a0");
  expect(comp.type).toBe(0x24);
  expect(comp.value).toEqualUint8Array([0x0F, 0xA0]);
});

test("compare", () => {
  const comp = new Component(0xF0, new Uint8Array([0x41, 0x42]));
  expect(comp.compare("241=AB")).toBe(ComponentCompareResult.LT);
  expect(comp.compare("240=ABC")).toBe(ComponentCompareResult.LT);
  expect(comp.compare("240=AC")).toBe(ComponentCompareResult.LT);
  expect(comp.compare("240=AB")).toBe(ComponentCompareResult.EQUAL);
  expect(comp.compare("240=AA")).toBe(ComponentCompareResult.GT);
  expect(comp.compare("240=A")).toBe(ComponentCompareResult.GT);
  expect(comp.compare("239=AB")).toBe(ComponentCompareResult.GT);
  expect(comp.equals("240=AB")).toBeTruthy();
  expect(comp.equals("240=AC")).toBeFalsy();
});
