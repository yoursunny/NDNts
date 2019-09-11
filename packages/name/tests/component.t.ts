import { Component } from "../src";

test("simple decode", () => {
  let comp = new Component(new Uint8Array([0x08, 0x00]));
  expect(comp.type).toBe(0x08);
  expect(comp.value).toEqual(new Uint8Array([]));
  expect(comp.toString()).toEqual("...")

  comp = new Component(new Uint8Array([0xF0, 0x03, 0x41, 0x01, 0xA0]));
  expect(comp.type).toBe(0xF0);
  expect(comp.value).toEqual(new Uint8Array([0x41, 0x01, 0xA0]));
  expect(comp.toString()).toEqual("240=A%01%a0")
});

test("error on decode TLV-TYPE out of range", () => {
  expect(() => {
    new Component(new Uint8Array([0x00, 0x01, 0x41]));
  }).toThrow();

  expect(() => {
    new Component(new Uint8Array([0xFE, 0x00, 0x01, 0x00, 0x00, 0x01, 0x41]));
  }).toThrow();
});

test("set TLV-TYPE", () => {
  const comp = new Component();

  comp.type = 0x01;
  expect(comp.type).toBe(0x01);
  expect(comp.toString()).toBe("1=...");

  comp.type = 0xFFFF;
  comp.value = new Uint8Array([0x41]);
  expect(comp.type).toBe(0xFFFF);
  expect(comp.toString()).toBe("65535=A");

  expect(() => { comp.type = 0; }).toThrow();
  expect(() => { comp.type = 0x10000; }).toThrow();
});