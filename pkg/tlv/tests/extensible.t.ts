import "../test-fixture/expect";

import { beforeEach, expect, test } from "vitest";

import { Decoder, type Encodable, Encoder, EvDecoder, Extensible, Extension, ExtensionRegistry, NNI } from "..";

const EXTENSIONS: ExtensionRegistry<ExtTestTarget> = new ExtensionRegistry<ExtTestTarget>();

const EVD = new EvDecoder<ExtTestTarget>("ExtTestTarget")
  .setUnknown(EXTENSIONS.decodeUnknown);

class ExtTestTarget implements Extensible {
  public readonly [Extensible.TAG] = EXTENSIONS;
  public declare a1: number | undefined;
  public declare a2: boolean | undefined;

  public encodeTo(encoder: Encoder) {
    encoder.prependTlv(0xA0, ...EXTENSIONS.encode(this));
  }
}
Extensible.defineGettersSetters(ExtTestTarget, {
  a1: 0xA1,
  a2: 0xA2,
});

beforeEach(() => {
  EXTENSIONS.registerExtension<number>({
    tt: 0xA1,
    order: 0xA3,
    decode(obj, { nni }, accumulator = 0): number {
      void obj;
      return accumulator + nni;
    },
    encode(obj, value): Encodable {
      void obj;
      return [this.tt, NNI(value)];
    },
  });
  EXTENSIONS.registerExtension<boolean>({
    tt: 0xA2,
    decode() {
      return true;
    },
    encode(obj, value) {
      void obj;
      if (value) {
        return [this.tt];
      }
      return undefined;
    },
  });
  return () => {
    EXTENSIONS.unregisterExtension(0xA1);
    EXTENSIONS.unregisterExtension(0xA2);
  };
});

test("encode", () => {
  const target = new ExtTestTarget();
  expect(target).toEncodeAs([
    0xA0, 0x00,
  ]);

  target.a1 = 5;
  target.a2 = true;
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

  target.a1 = undefined;
  target.a2 = false;
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
  expect(obj.a1).toBe(4);
  expect(obj.a2).toBeUndefined();

  decoder = new Decoder(Uint8Array.of(
    0xA0, 0x02,
    0xA2, 0x00,
  ));
  obj = EVD.decode(new ExtTestTarget(), decoder);
  expect(obj.a1).toBeUndefined();
  expect(obj.a2).toBe(true);

  decoder = new Decoder(Uint8Array.of(
    0xA0, 0x02,
    0xA3, 0x00, // not matching any extension, critical
  ));
  expect(() => EVD.decode(new ExtTestTarget(), decoder)).toThrow();
});
