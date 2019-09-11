import { Component } from "../src";

test("simple decode", () => {
  let comp = new Component();
  expect(comp.type).toBe(0x08);
  expect(comp.value).toEqual(new Uint8Array([]));
  expect(comp.toString()).toEqual("...")

  comp = new Component(new Uint8Array([0xF0, 0x03, 0x41, 0x01, 0xA0]));
  expect(comp.type).toBe(0xF0);
  expect(comp.value).toEqual(new Uint8Array([0x41, 0x01, 0xA0]));
  expect(comp.toString()).toEqual("240=A%01%a0")

  comp = new Component(0xFFFF, new Uint8Array([0x41]));
  expect(comp.type).toBe(0xFFFF);
  expect(comp.value).toEqual(new Uint8Array([0x41]));
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
  expect(comp.value).toEqual(new Uint8Array([0x41]));

  comp = Component.from("20=A%00B");
  expect(comp.type).toBe(0x14);
  expect(comp.value).toEqual(new Uint8Array([0x41, 0x00, 0x42]));

  comp = Component.from(".....");
  expect(comp.type).toBe(0x08);
  expect(comp.value).toEqual(new Uint8Array([0x2E, 0x2E]));
});
