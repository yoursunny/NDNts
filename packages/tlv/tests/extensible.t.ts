import "../test-fixture/expect";

import { afterEach, beforeEach, expect, test } from "vitest";

import { type Encodable, Decoder, Encoder, EvDecoder, Extensible, Extension, ExtensionRegistry, NNI } from "..";

const EXTENSIONS: ExtensionRegistry<ExtTestTarget> = new ExtensionRegistry<ExtTestTarget>();

const EVD = new EvDecoder<ExtTestTarget>("ExtTestTarget")
  .setUnknown(EXTENSIONS.decodeUnknown);

class ExtTestTarget implements Extensible {
  public readonly [Extensible.TAG] = EXTENSIONS;

  public encodeTo(encoder: Encoder) {
    encoder.prependTlv(0xA0, ...EXTENSIONS.encode(this));
  }
}

class A1Extension implements Extension<ExtTestTarget, number> {
  public readonly tt = 0xA1;
  public readonly order = 0xA3;
  public decode(obj: ExtTestTarget, { nni }: Decoder.Tlv, accumulator?: number): number {
    return (accumulator ?? 0) + nni;
  }

  public encode(obj: ExtTestTarget, value: number): Encodable {
    return [this.tt, NNI(value)];
  }
}

class A2Extension implements Extension<ExtTestTarget, boolean> {
  public readonly tt = 0xA2;
  public decode(): boolean {
    return true;
  }

  public encode(obj: ExtTestTarget, value: boolean): Encodable {
    if (value) {
      return [this.tt];
    }
    return undefined;
  }
}

beforeEach(() => {
  EXTENSIONS.registerExtension(new A1Extension());
  EXTENSIONS.registerExtension(new A2Extension());
});

afterEach(() => {
  EXTENSIONS.unregisterExtension(0xA1);
  EXTENSIONS.unregisterExtension(0xA2);
});

test("encode", () => {
  const target = new ExtTestTarget();
  expect(target).toEncodeAs([
    0xA0, 0x00,
  ]);

  Extension.set(target, 0xA1, 5);
  Extension.set(target, 0xA2, true);
  expect(target).toEncodeAs([
    0xA0, 0x05,
    0xA2, 0x00,
    0xA1, 0x01, 0x05,
  ]);

  const target2 = new ExtTestTarget();
  Extensible.cloneRecord(target2, target);
  expect(target2).toEncodeAs([
    0xA0, 0x05,
    0xA2, 0x00,
    0xA1, 0x01, 0x05,
  ]);

  Extension.clear(target, 0xA1);
  Extension.set(target, 0xA2, false);
  expect(target).toEncodeAs([
    0xA0, 0x00,
  ]);

  Extension.set(target, 0xA3, 0);
  expect(() => Encoder.encode(target)).toThrow(/unknown extension type/);
});

test("decode", () => {
  let decoder = new Decoder(Uint8Array.of(
    0xA0, 0x06,
    0xA1, 0x01, 0x01,
    0xA1, 0x01, 0x03,
  ));
  let obj = EVD.decode(new ExtTestTarget(), decoder);
  expect(Extension.get(obj, 0xA1)).toBe(4);
  expect(Extension.get(obj, 0xA2)).toBeUndefined();

  decoder = new Decoder(Uint8Array.of(
    0xA0, 0x02,
    0xA2, 0x00,
  ));
  obj = EVD.decode(new ExtTestTarget(), decoder);
  expect(Extension.get(obj, 0xA1)).toBeUndefined();
  expect(Extension.get(obj, 0xA2)).toBe(true);

  decoder = new Decoder(Uint8Array.of(
    0xA0, 0x02,
    0xA3, 0x00, // not matching any extension, critical
  ));
  expect(() => EVD.decode(new ExtTestTarget(), decoder)).toThrow();
});
