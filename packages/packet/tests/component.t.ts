import "@ndn/tlv/test-fixture/expect";

import { Decoder } from "@ndn/tlv";

import { AltUri, Component } from "..";

test("decode", () => {
  let comp = new Component();
  expect(comp.type).toBe(0x08);
  expect(comp.value).toEqualUint8Array([]);
  expect(comp.toString()).toEqual("8=...");
  expect(AltUri.ofComponent(comp)).toEqual("...");

  const decoder = new Decoder(Uint8Array.of(0xF0, 0x03, 0x41, 0x01, 0xA0));
  comp = decoder.decode(Component);
  expect(comp.type).toBe(0xF0);
  expect(comp.value).toEqualUint8Array([0x41, 0x01, 0xA0]);
  expect(comp.toString()).toEqual("240=A%01%A0");
  expect(AltUri.ofComponent(comp)).toEqual("240=A%01%A0");

  comp = new Component(0xFFFF, Uint8Array.of(0x41));
  expect(comp.type).toBe(0xFFFF);
  expect(comp.value).toEqualUint8Array([0x41]);
  expect(comp.toString()).toEqual("65535=A");
  expect(AltUri.ofComponent(comp)).toEqual("65535=A");
});

test("error on decode TLV-TYPE out of range", () => {
  expect(() => new Component(0x00)).toThrow();
  expect(() => new Component(0x10000)).toThrow();

  let decoder = new Decoder(Uint8Array.of(0x00, 0x01, 0x41));
  expect(() => decoder.decode(Component)).toThrow();
  decoder = new Decoder(Uint8Array.of(0xFE, 0x00, 0x01, 0x00, 0x00, 0x01, 0x41));
  expect(() => decoder.decode(Component)).toThrow();
});

test("from URI or string", () => {
  let comp = Component.from("A");
  expect(comp.type).toBe(0x08);
  expect(comp).toHaveLength(1);
  expect(comp.value).toEqualUint8Array([0x41]);
  expect(comp.text).toBe("A");

  comp = Component.from("20=A%00B");
  expect(comp.type).toBe(0x14);
  expect(comp).toHaveLength(3);
  expect(comp.value).toEqualUint8Array([0x41, 0x00, 0x42]);

  comp = new Component(0x14, "A%00B");
  expect(comp.type).toBe(0x14);
  expect(comp).toHaveLength(5);
  expect(comp.value).toEqualUint8Array([0x41, 0x25, 0x30, 0x30, 0x42]);
  expect(comp.text).toBe("A%00B");

  comp = Component.from(".....");
  expect(comp.type).toBe(0x08);
  expect(comp).toHaveLength(2);
  expect(comp.value).toEqualUint8Array([0x2E, 0x2E]);
  expect(comp.text).toBe("..");

  comp = Component.from("36=%0f%a0");
  expect(comp.type).toBe(0x24);
  expect(comp).toHaveLength(2);
  expect(comp.value).toEqualUint8Array([0x0F, 0xA0]);
});

test("compare", () => {
  const comp = new Component(0xF0, Uint8Array.of(0x41, 0x42));
  expect(comp.compare("241=AB")).toBe(Component.CompareResult.LT);
  expect(comp.compare("240=ABC")).toBe(Component.CompareResult.LT);
  expect(comp.compare("240=AC")).toBe(Component.CompareResult.LT);
  expect(comp.compare("240=AB")).toBe(Component.CompareResult.EQUAL);
  expect(comp.compare("240=AA")).toBe(Component.CompareResult.GT);
  expect(comp.compare("240=A")).toBe(Component.CompareResult.GT);
  expect(comp.compare("239=AB")).toBe(Component.CompareResult.GT);
  expect(comp.equals("240=AB")).toBeTruthy();
  expect(comp.equals("240=AC")).toBeFalsy();
});
