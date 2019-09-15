import { Decoder, EvDecoder } from "../src";
import "../src/expect";

class EvdTestTarget {
  public a1 = 0;
  public a4 = 0;
  public a6 = 0;
  public a9 = 0;

  public sum(): number {
    return this.a1 * 1000 + this.a4 * 100 + this.a6 * 10 + this.a9;
  }
};

test("simple", () => {
  const evd = new EvDecoder<EvdTestTarget>(0xA0, [
    { tt: 0xA1, cb: (self) => { ++self.a1; } },
    { tt: 0xA4, cb: (self) => { ++self.a4; } },
    { tt: 0xA6, cb: (self) => { ++self.a6; }, repeatable: true },
    { tt: 0xA9, cb: (self) => { ++self.a9; } },
  ]);

  let decoder = new Decoder(new Uint8Array([
    0xA0, 0x0A,
    0xA1, 0x00,
    0xA4, 0x00,
    0xA6, 0x00,
    0xA6, 0x00,
    0xA9, 0x00,
  ]));
  let target = new EvdTestTarget();
  evd.decode(target, decoder);
  expect(target.sum()).toBe(1121);

  decoder = new Decoder(new Uint8Array([
    0xA0, 0x02,
    0xA2, 0x00, // non-critical
  ]));
  target = new EvdTestTarget();
  evd.decode(target, decoder);
  expect(target.sum()).toBe(0);

  decoder = new Decoder(new Uint8Array([
    0xA0, 0x02,
    0xA3, 0x00, // critical
  ]));
  target = new EvdTestTarget();
  expect(() => { evd.decode(target, decoder); }).toThrow();

  decoder = new Decoder(new Uint8Array([
    0xA0, 0x02,
    0x10, 0x00, // critical
  ]));
  target = new EvdTestTarget();
  expect(() => { evd.decode(target, decoder); }).toThrow();

  decoder = new Decoder(new Uint8Array([
    0xA0, 0x04,
    0xA1, 0x00,
    0xA1, 0x00, // cannot repeat
  ]));
  target = new EvdTestTarget();
  expect(() => { evd.decode(target, decoder); }).toThrow();

  decoder = new Decoder(new Uint8Array([
    0xA0, 0x04,
    0xA4, 0x00,
    0xA1, 0x00, // out of order, critical
  ]));
  target = new EvdTestTarget();
  expect(() => { evd.decode(target, decoder); }).toThrow();

  decoder = new Decoder(new Uint8Array([
    0xA0, 0x06,
    0xA6, 0x00,
    0xA9, 0x00,
    0xA6, 0x00, // out of order, non-critical
  ]));
  target = new EvdTestTarget();
  evd.decode(target, decoder);
  expect(target.sum()).toBe(11);
});
