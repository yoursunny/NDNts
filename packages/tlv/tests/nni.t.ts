import { NNI } from "../src";
import "../src/expect";

test("instance", () => {
  const nni = NNI(0xA0A1);
  expect(nni).toBeInstanceOf(Number);
  expect(Number(nni)).toBe(0xA0A1);
});

test("encode", () => {
  expect(NNI(0x00)).toEncodeAs([0x00]);
  expect(NNI(0xFF)).toEncodeAs([0xFF]);
  expect(NNI(0x0100)).toEncodeAs([0x01, 0x00]);
  expect(NNI(0xFFFF)).toEncodeAs([0xFF, 0xFF]);
  expect(NNI(0x010000)).toEncodeAs([0x00, 0x01, 0x00, 0x00]);
  expect(NNI(0xFFFFFFFF)).toEncodeAs([0xFF, 0xFF, 0xFF, 0xFF]);
  expect(NNI(0x0100000000)).toEncodeAs([0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00]);
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
