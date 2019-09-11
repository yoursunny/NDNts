import { Decoder } from "../src";

test("simple decode", () => {
  const decoder = new Decoder(new Uint8Array([
    0x01, 0x00,
    0xFD, 0x04, 0x09, 0x02, 0xB0, 0xB1,
    0xFE, 0x00, 0x02, 0x04, 0x09, 0x03, 0xC0, 0xC1, 0xC2,
  ]));
  expect(decoder.readType()).toBe(0x01);
  expect(decoder.readValue()).toEqual(new Uint8Array([]));
  expect(decoder.readType()).toBe(0x0409);
  expect(decoder.readValue()).toEqual(new Uint8Array([0xB0, 0xB1]));
  expect(decoder.readType()).toBe(0x00020409);
  expect(decoder.readValue()).toEqual(new Uint8Array([0xC0, 0xC1, 0xC2]));
});

test("error on incomplete VAR-NUMBER", () => {
  let decoder = new Decoder(new Uint8Array([]));
  expect(() => { decoder.readType() }).toThrow();

  decoder = new Decoder(new Uint8Array([0xFD, 0x01]));
  expect(() => { decoder.readType() }).toThrow();

  decoder = new Decoder(new Uint8Array([0xFE, 0x00, 0x01, 0x02]));
  expect(() => { decoder.readType() }).toThrow();
});

test("error on VAR-NUMBER-9", () => {
  const decoder = new Decoder(new Uint8Array([
    0x01, 0xFF, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x01, 0xA0
  ]));
  expect(decoder.readType()).toBe(0x01);
  expect(() => { decoder.readValue() }).toThrow();
});

test("error on incomplete TLV-VALUE", () => {
  const decoder = new Decoder(new Uint8Array([
    0x01, 0x05, 0xA0, 0xA1, 0xA2
  ]));
  expect(decoder.readType()).toBe(0x01);
  expect(() => { decoder.readValue() }).toThrow();
});
