import { Decoder, EvDecoder } from "../src";
import "../test-fixture";

class EvdTestTarget {
  public top?: Decoder.Tlv;
  public a1 = 0;
  public a4 = 0;
  public a6 = 0;
  public a9 = 0;
  public c1 = 0;
  public c2 = 0;

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

const EVD = new EvDecoder<EvdTestTarget>("A0", 0xA0)
.setTop((t, tlv) => t.top = tlv)
.add(0xA1, (t, { decoder }) => { ++t.a1; decoder.decode(A1); })
.add(0xA4, (t) => { ++t.a4; })
.add(0xA6, (t) => { ++t.a6; }, { repeat: true })
.add(0xA9, (t) => { ++t.a9; })
.add(0xC0,
  new EvDecoder<EvdTestTarget>("C0")
  .add(0xC1, (t, { nni }) => { t.c1 = nni; }),
);

test("decode normal", () => {
  const decoder = new Decoder(Uint8Array.of(
    0xA0, 0x11,
    0xA1, 0x01, 0x10,
    0xA4, 0x00,
    0xA6, 0x00,
    0xA6, 0x00,
    0xA9, 0x00,
    0xC0, 0x04, 0xC1, 0x02, 0x01, 0x04,
  ));
  const target = new EvdTestTarget();
  EVD.decode(target, decoder);
  expect(target.top).not.toBeUndefined();
  expect(target.top!.type).toBe(0xA0);
  expect(target.sum()).toBe(1121);
  expect(target.c1).toBe(0x0104);
});

test("decode unknown non-critical", () => {
  const decoder = new Decoder(Uint8Array.of(
    0xA0, 0x02,
    0xA2, 0x00, // non-critical
  ));
  const target = new EvdTestTarget();
  EVD.decode(target, decoder);
  expect(target.sum()).toBe(0);
});

test("decode unknown critical", () => {
  const decoder = new Decoder(Uint8Array.of(
    0xA0, 0x02,
    0xA3, 0x00,
  ));
  const target = new EvdTestTarget();
  expect(() => EVD.decode(target, decoder)).toThrow();
});

test("decode unknown critical in grandfathered range", () => {
  const decoder = new Decoder(Uint8Array.of(
    0xA0, 0x02,
    0x10, 0x00,
  ));
  const target = new EvdTestTarget();
  expect(() => EVD.decode(target, decoder)).toThrow();
});

test("decode non-repeatable", () => {
  const decoder = new Decoder(Uint8Array.of(
    0xA0, 0x05,
    0xA1, 0x01, 0x10,
    0xA1, 0x00, // cannot repeat
  ));
  const target = new EvdTestTarget();
  expect(() => EVD.decode(target, decoder)).toThrow();
});

test("decode out-of-order critical", () => {
  const decoder = new Decoder(Uint8Array.of(
    0xA0, 0x04,
    0xA4, 0x00,
    0xA1, 0x00,
  ));
  const target = new EvdTestTarget();
  expect(() => EVD.decode(target, decoder)).toThrow();
});

test("decode out-of-order non-critical", () => {
  const decoder = new Decoder(Uint8Array.of(
    0xA0, 0x06,
    0xA6, 0x00,
    0xA9, 0x00,
    0xA6, 0x00,
  ));
  const target = new EvdTestTarget();
  EVD.decode(target, decoder);
  expect(target.sum()).toBe(11);
});

test("decode bad TLV-TYPE", () => {
  const decoder = new Decoder(Uint8Array.of(0xAF, 0x00));
  const target = new EvdTestTarget();
  expect(() => EVD.decode(target, decoder)).toThrow();
  expect(target.top).toBeUndefined();
});

test("add duplicate", () => {
  expect(() => EVD.add(0xA1, () => undefined)).toThrow(); // duplicate rule
});

test("setIsCritical", () => {
  const cb = jest.fn((tt: number) => tt === 0xA2);

  const evd = new EvDecoder<EvdTestTarget>("A0", 0xA0)
  .setIsCritical(cb)
  .add(0xA1, (t) => { ++t.a1; });

  const decoder = new Decoder(Uint8Array.of(
    // first object
    0xA0, 0x04,
    0xA1, 0x00, // recognized
    0xA3, 0x00, // non-critical in cb
    // second object
    0xA0, 0x04,
    0xA1, 0x00, // recognized
    0xA2, 0x00, // critical in cb
  ));
  const target = evd.decode(new EvdTestTarget(), decoder);
  expect(target.sum()).toBe(1000);
  expect(cb).toHaveBeenCalledTimes(1);

  expect(() => evd.decode(new EvdTestTarget(), decoder)).toThrow(/TLV-TYPE 0xA2/);
  expect(cb).toHaveBeenCalledTimes(2);
});

test("setUnknown", () => {
  const cb = jest.fn((t: EvdTestTarget, { type }: Decoder.Tlv, order: number) => {
    if (type === 0xA1) {
      ++t.a1;
      return true;
    }
    return false;
  });

  const evd = new EvDecoder<EvdTestTarget>("A0AA", [0xA0, 0xAA])
  .add(0xA4, (t) => { ++t.a4; }, { order: 7 })
  .setUnknown(cb);

  const decoder = new Decoder(Uint8Array.of(
    0xAA, 0x0A,
    0xA2, 0x00, // ignored
    0xA1, 0x00, // handled by cb
    0xA4, 0x00, // handled by rule
    0xA1, 0x00, // handled by cb
    0xA6, 0x00, // ignored
  ));
  const target = evd.decode(new EvdTestTarget(), decoder);
  expect(target.sum()).toBe(2100);

  expect(cb).toHaveBeenCalledTimes(4);
  expect(cb.mock.calls[0][1].type).toBe(0xA2);
  expect(cb.mock.calls[0][2]).toBe(0);
  expect(cb.mock.calls[1][1].type).toBe(0xA1);
  expect(cb.mock.calls[1][2]).toBe(0);
  expect(cb.mock.calls[2][1].type).toBe(0xA1);
  expect(cb.mock.calls[2][2]).toBe(7);
  expect(cb.mock.calls[3][1].type).toBe(0xA6);
  expect(cb.mock.calls[3][2]).toBe(7);
});
