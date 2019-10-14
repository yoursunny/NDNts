import { Encoder, NNI } from "../src";
import "../test-fixture";

test("encode variable size", () => {
  expect(NNI(0x00)).toEncodeAs([0x00]);
  expect(NNI(0xFF)).toEncodeAs([0xFF]);
  expect(NNI(0x0100)).toEncodeAs([0x01, 0x00]);
  expect(NNI(0xFFFF)).toEncodeAs([0xFF, 0xFF]);
  expect(NNI(0x010000)).toEncodeAs([0x00, 0x01, 0x00, 0x00]);
  expect(NNI(0xFFFFFFFF)).toEncodeAs([0xFF, 0xFF, 0xFF, 0xFF]);
  expect(NNI(0x0100000000)).toEncodeAs([0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00]);
  expect(() => Encoder.encode(NNI(Number.MAX_VALUE))).toThrow();
});

test("encode fixed size", () => {
  expect(NNI(0x01, 1)).toEncodeAs([0x01]);
  expect(NNI(0x04, 4)).toEncodeAs([0x00, 0x00, 0x00, 0x04]);
});

test("decode variable size", () => {
  expect(NNI.decode(Uint8Array.of(0x00))).toBe(0x00);
  expect(NNI.decode(Uint8Array.of(0xFF))).toBe(0xFF);
  expect(NNI.decode(Uint8Array.of(0x01, 0x00))).toBe(0x0100);
  expect(NNI.decode(Uint8Array.of(0xFF, 0xFF))).toBe(0xFFFF);
  expect(NNI.decode(Uint8Array.of(0x00, 0x01, 0x00, 0x00))).toBe(0x010000);
  expect(NNI.decode(Uint8Array.of(0xFF, 0xFF, 0xFF, 0xFF))).toBe(0xFFFFFFFF);
  expect(NNI.decode(Uint8Array.of(0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00))).toBe(0x0100000000);
  expect(NNI.decode(Encoder.encode(NNI(Number.MAX_SAFE_INTEGER)))).toBe(Number.MAX_SAFE_INTEGER);
  expect(() => NNI.decode(Uint8Array.of(0x01, 0x00, 0x00))).toThrow();
  expect(() => NNI.decode(Uint8Array.of(0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF))).toThrow(/large/);
});

test("decode fixed size", () => {
  expect(NNI.decode(Uint8Array.of(0x01), 1)).toBe(0x01);
  expect(() => NNI.decode(Uint8Array.of(0x00, 0x00, 0x03), 1)).toThrow();

  expect(NNI.decode(Uint8Array.of(0x00, 0x00, 0x00, 0x04), 4)).toBe(0x04);
  expect(() => NNI.decode(Uint8Array.of(0x00, 0x00, 0x03), 4)).toThrow();
});

test("constrain", () => {
  expect(NNI.constrain(0, "XXXX")).toBe(0);
  expect(NNI.constrain(1.8, "XXXX")).toBe(1);
  expect(NNI.constrain(Number.MAX_SAFE_INTEGER, "XXXX")).toBe(Number.MAX_SAFE_INTEGER);
  expect(() => NNI.constrain(-1, "XXXX")).toThrow(/XXXX/);
  expect(() => NNI.constrain(Number.MAX_VALUE, "XXXX")).toThrow(/XXXX/);
  expect(NNI.constrain(8, "XXXX", 8)).toBe(8);
  expect(() => NNI.constrain(9, "XXXX", 8)).toThrow(/XXXX/);
});
