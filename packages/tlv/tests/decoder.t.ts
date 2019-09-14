import { Decoder } from "../src";
import "../src/expect";

test("simple", () => {
  const decoder = new Decoder(new Uint8Array([
    0x01, 0x00,
    0xFD, 0x04, 0x09, 0x02, 0xB0, 0xB1,
    0xFE, 0x00, 0x02, 0x04, 0x09, 0x03, 0xC0, 0x01, 0xC2,
  ]));
  expect(decoder.readType()).toBe(0x01);
  expect(decoder.readValue()).toEqualUint8Array([]);
  expect(decoder.readType()).toBe(0x0409);
  expect(decoder.readValue()).toEqualUint8Array([0xB0, 0xB1]);
  expect(decoder.readType()).toBe(0x00020409);
  const vDecoder = decoder.createValueDecoder();
  expect(vDecoder.readType()).toBe(0xC0);
  expect(vDecoder.readValue()).toEqualUint8Array([0xC2]);
  expect(vDecoder.eof).toBeTruthy();
  expect(decoder.eof).toBeTruthy();
});

test("from", () => {
  const decoder = new Decoder(new Uint8Array());
  expect(Decoder.isInput(decoder)).toBeTruthy();
  expect(Decoder.from(decoder)).toBe(decoder);

  const wire = new Uint8Array();
  expect(Decoder.isInput(wire)).toBeTruthy();
  expect(Decoder.from(wire)).toBeInstanceOf(Decoder);

  expect(Decoder.isInput({})).toBeFalsy();
  expect(() => { Decoder.from({} as any); }).toThrow();
});

test("readTypeExpect", () => {
  let decoder = new Decoder(new Uint8Array([0x01, 0x00]));
  expect(decoder.readTypeExpect(0x01, 0x02)).toBe(0x01);

  decoder = new Decoder(new Uint8Array([0x01, 0x00]));
  expect(() => { decoder.readTypeExpect(0x03, 0x04); }).toThrow();

  decoder = new Decoder(new Uint8Array([0xFD, 0x01, 0x02, 0x00]));
  let accept = jest.fn();
  accept.mockReturnValue(true);
  expect(decoder.readTypeExpect(accept)).toBe(0x0102);
  expect(accept).toHaveBeenCalledWith(0x0102);

  decoder = new Decoder(new Uint8Array([0xFD, 0x01, 0x03, 0x00]));
  accept = jest.fn();
  accept.mockReturnValue(false);
  expect(() => { decoder.readTypeExpect(accept, "XXXX"); }).toThrow(/XXXX/);
  expect(accept).toHaveBeenCalledWith(0x0103);
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
