import "../test-fixture/expect";

import { Encoder, NNI } from "..";

test.each([
  [Number],
  [BigInt],
])("encode variable size %p", (ctor) => {
  expect(NNI(ctor(0x00))).toEncodeAs([0x00]);
  expect(NNI(ctor(0xFF))).toEncodeAs([0xFF]);
  expect(NNI(ctor(0x0100))).toEncodeAs([0x01, 0x00]);
  expect(NNI(ctor(0xFFFF))).toEncodeAs([0xFF, 0xFF]);
  expect(NNI(ctor(0x010000))).toEncodeAs([0x00, 0x01, 0x00, 0x00]);
  expect(NNI(ctor(0xFFFFFFFF))).toEncodeAs([0xFF, 0xFF, 0xFF, 0xFF]);
  expect(NNI(ctor(0x0100000000))).toEncodeAs([0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00]);
  expect(() => Encoder.encode(NNI(ctor(-1)))).toThrow(/negative/);
});

test("encode big", () => {
  expect(() => Encoder.encode(NNI(Number.MAX_SAFE_INTEGER))).not.toThrow();
  // eslint-disable-next-line @typescript-eslint/no-loss-of-precision
  expect(() => Encoder.encode(NNI(0xFFFFFFFFFFFFFFFF))).toThrow(/large/);
  // eslint-disable-next-line @typescript-eslint/no-loss-of-precision
  expect(() => Encoder.encode(NNI(0xFFFFFFFFFFFFFFFF, { unsafe: true }))).not.toThrow();
  // eslint-disable-next-line @typescript-eslint/no-loss-of-precision
  expect(() => Encoder.encode(NNI(0x1FFFFFFFFFFFFFFFF, { unsafe: true }))).toThrow(/large/);

  expect(NNI(BigInt("0xFFFFFFFFFFFFFFFF"))).toEncodeAs([0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF]);
  expect(() => Encoder.encode(NNI(BigInt("0x10000000000000000")))).toThrow(/large/);
});

test("encode fixed size", () => {
  expect(NNI(0x01, { len: 1 })).toEncodeAs([0x01]);
  expect(NNI(0x02, { len: 2 })).toEncodeAs([0x00, 0x02]);
  expect(NNI(0x04, { len: 4 })).toEncodeAs([0x00, 0x00, 0x00, 0x04]);
  expect(NNI(0x08, { len: 8 })).toEncodeAs([0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x08]);

  expect(NNI(BigInt(0x01), { len: 1 })).toEncodeAs([0x01]);
  expect(NNI(BigInt(0x02), { len: 2 })).toEncodeAs([0x00, 0x02]);
  expect(NNI(BigInt(0x04), { len: 4 })).toEncodeAs([0x00, 0x00, 0x00, 0x04]);
  expect(NNI(BigInt(0x08), { len: 8 })).toEncodeAs([0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x08]);
});

test("decode variable size", () => {
  expect(NNI.decode(Uint8Array.of(0x00))).toBe(0x00);
  expect(NNI.decode(Uint8Array.of(0xFF))).toBe(0xFF);
  expect(NNI.decode(Uint8Array.of(0x01, 0x00))).toBe(0x0100);
  expect(NNI.decode(Uint8Array.of(0xFF, 0xFF))).toBe(0xFFFF);
  expect(NNI.decode(Uint8Array.of(0x00, 0x01, 0x00, 0x00))).toBe(0x010000);
  expect(NNI.decode(Uint8Array.of(0xFF, 0xFF, 0xFF, 0xFF))).toBe(0xFFFFFFFF);
  expect(NNI.decode(Uint8Array.of(0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00))).toBe(0x0100000000);
  expect(() => NNI.decode(Uint8Array.of(0x01, 0x00, 0x00))).toThrow();
});

test("decode big", () => {
  const uOne = Uint8Array.of(0x01);
  expect(NNI.decode(uOne)).toBe(1);
  expect(NNI.decode(uOne, { unsafe: true })).toBe(1);
  expect(NNI.decode(uOne, { big: true })).toBe(BigInt(1));

  const uSafe = Encoder.encode(NNI(Number.MAX_SAFE_INTEGER));
  expect(NNI.decode(uSafe)).toBe(Number.MAX_SAFE_INTEGER);
  expect(NNI.decode(uSafe, { unsafe: true })).toBe(Number.MAX_SAFE_INTEGER);
  expect(NNI.decode(uSafe, { big: true })).toBe(BigInt(Number.MAX_SAFE_INTEGER));

  const uMax = Uint8Array.of(0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF);
  expect(() => NNI.decode(uMax)).toThrow(/large/);
  expect(typeof NNI.decode(uMax, { unsafe: true })).toBe("number");
  expect(NNI.decode(uMax, { big: true })).toBe(BigInt("0xFFFFFFFFFFFFFFFF"));
});

test("decode fixed size", () => {
  expect(NNI.decode(Uint8Array.of(0x01), { len: 1 })).toBe(0x01);
  expect(() => NNI.decode(Uint8Array.of(0x00, 0x00, 0x03), { len: 1 })).toThrow();

  expect(NNI.decode(Uint8Array.of(0x00, 0x00, 0x00, 0x04), { len: 4 })).toBe(0x04);
  expect(() => NNI.decode(Uint8Array.of(0x00, 0x00, 0x03), { len: 4 })).toThrow();
});

test("constrain", () => {
  expect(NNI.constrain(0, "XXXX")).toBe(0);
  expect(NNI.constrain(1.8, "XXXX")).toBe(1);
  expect(NNI.constrain(Number.MAX_SAFE_INTEGER, "XXXX")).toBe(Number.MAX_SAFE_INTEGER);
  expect(() => NNI.constrain(-1, "XXXX")).toThrow(/XXXX/);
  expect(() => NNI.constrain(Number.MAX_VALUE, "XXXX")).toThrow(/XXXX/);
  expect(NNI.constrain(8, "XXXX", 8)).toBe(8);
  expect(() => NNI.constrain(9, "XXXX", 8)).toThrow(/XXXX/);
  expect(NNI.constrain(2, "XXXX", 2, 6)).toBe(2);
  expect(() => NNI.constrain(1, "XXXX", 2, 6)).toThrow(/XXXX/);
});
