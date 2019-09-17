import { Decoder, EvDecoder, NNI } from "../src";
import "../test-fixture";

class EvdTestTarget {
  public a1 = 0;
  public a4 = 0;
  public a6 = 0;
  public a9 = 0;
  public c1 = 0;

  public sum(): number {
    return this.a1 * 1000 + this.a4 * 100 + this.a6 * 10 + this.a9;
  }
}

class A1 {
  public static decodeFrom(decoder: Decoder): A1 {
    const { type, length, value } = decoder.read();
    expect(type).toBe(0xA1);
    expect(length).toBe(1);
    expect(value).toEqualUint8Array([0x10]);
    return new A1();
  }
}

const EVD = new EvDecoder<EvdTestTarget>(0xA0, [
  { tt: 0xA1, cb: (self, { decoder }) => { ++self.a1; decoder.decode(A1); } },
  { tt: 0xA4, cb: (self) => { ++self.a4; } },
  { tt: 0xA6, cb: (self) => { ++self.a6; }, repeatable: true },
  { tt: 0xA9, cb: (self) => { ++self.a9; } },
  { tt: 0xC0, cb: EvDecoder.Nest(new EvDecoder<EvdTestTarget>(0xC0, [
    { tt: 0xC1, cb: (self, { value }) => { self.c1 = NNI.decode(value); } },
  ])) },
]);

test("simple", () => {
  let decoder = new Decoder(new Uint8Array([
    0xA0, 0x11,
    0xA1, 0x01, 0x10,
    0xA4, 0x00,
    0xA6, 0x00,
    0xA6, 0x00,
    0xA9, 0x00,
    0xC0, 0x04, 0xC1, 0x02, 0x01, 0x04,
  ]));
  let target = new EvdTestTarget();
  EVD.decode(target, decoder);
  expect(target.sum()).toBe(1121);
  expect(target.c1).toBe(0x0104);

  decoder = new Decoder(new Uint8Array([
    0xA0, 0x02,
    0xA2, 0x00, // non-critical
  ]));
  target = new EvdTestTarget();
  EVD.decode(target, decoder);
  expect(target.sum()).toBe(0);

  decoder = new Decoder(new Uint8Array([
    0xA0, 0x02,
    0xA3, 0x00, // critical
  ]));
  target = new EvdTestTarget();
  expect(() => EVD.decode(target, decoder)).toThrow();

  decoder = new Decoder(new Uint8Array([
    0xA0, 0x02,
    0x10, 0x00, // critical
  ]));
  target = new EvdTestTarget();
  expect(() => EVD.decode(target, decoder)).toThrow();

  decoder = new Decoder(new Uint8Array([
    0xA0, 0x05,
    0xA1, 0x01, 0x10,
    0xA1, 0x00, // cannot repeat
  ]));
  target = new EvdTestTarget();
  expect(() => EVD.decode(target, decoder)).toThrow();

  decoder = new Decoder(new Uint8Array([
    0xA0, 0x04,
    0xA4, 0x00,
    0xA1, 0x00, // out of order, critical
  ]));
  target = new EvdTestTarget();
  expect(() => EVD.decode(target, decoder)).toThrow();

  decoder = new Decoder(new Uint8Array([
    0xA0, 0x06,
    0xA6, 0x00,
    0xA9, 0x00,
    0xA6, 0x00, // out of order, non-critical
  ]));
  target = new EvdTestTarget();
  EVD.decode(target, decoder);
  expect(target.sum()).toBe(11);

  decoder = new Decoder(new Uint8Array([0xAF, 0x00]));
  target = new EvdTestTarget();
  expect(() => EVD.decode(target, decoder)).toThrow();
});
