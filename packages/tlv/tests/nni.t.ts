import { NNI } from "../src";

test("encode", () => {
  expect(NNI.encode(0x00)).toEqual(new Uint8Array([0x00]));
  expect(NNI.encode(0xFF)).toEqual(new Uint8Array([0xFF]));
  expect(NNI.encode(0x0100)).toEqual(new Uint8Array([0x01, 0x00]));
  expect(NNI.encode(0xFFFF)).toEqual(new Uint8Array([0xFF, 0xFF]));
  expect(NNI.encode(0x010000)).toEqual(new Uint8Array([0x00, 0x01, 0x00, 0x00]));
  expect(NNI.encode(0xFFFFFFFF)).toEqual(new Uint8Array([0xFF, 0xFF, 0xFF, 0xFF]));
  expect(NNI.encode(0x0100000000)).toEqual(new Uint8Array([0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00]));
  expect(() => { NNI.encode(Number.MAX_VALUE); }).toThrow();
});

test("decode", () => {
  expect(NNI.decode(new Uint8Array([0x00]))).toBe(0x00);
  expect(NNI.decode(new Uint8Array([0xFF]))).toBe(0xFF);
  expect(NNI.decode(new Uint8Array([0x01, 0x00]))).toBe(0x0100);
  expect(NNI.decode(new Uint8Array([0xFF, 0xFF]))).toBe(0xFFFF);
  expect(NNI.decode(new Uint8Array([0x00, 0x01, 0x00, 0x00]))).toBe(0x010000);
  expect(NNI.decode(new Uint8Array([0xFF, 0xFF, 0xFF, 0xFF]))).toBe(0xFFFFFFFF);
  expect(NNI.decode(new Uint8Array([0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00]))).toBe(0x0100000000);
  expect(NNI.decode(NNI.encode(Number.MAX_SAFE_INTEGER))).toBe(Number.MAX_SAFE_INTEGER);
  expect(() => { NNI.decode(new Uint8Array([0x01, 0x00, 0x00])); }).toThrow();
  expect(() => { NNI.decode(new Uint8Array([0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF])); }).toThrow(/large/);
});
