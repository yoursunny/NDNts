import "../test-fixture/expect";

import { expect, test } from "vitest";

import { Decoder, type Encodable, type Encoder, EvDecoder, Extensible, Extension, ExtensionRegistry, NNI, StructFieldBool, StructFieldNNI, StructFieldText } from "..";

const EXTENSIONS: ExtensionRegistry<ExtTestTarget> = new ExtensionRegistry<ExtTestTarget>();
EXTENSIONS.register(0xA1, StructFieldNNI, { order: 0xA9 });
EXTENSIONS.register(0xA2, StructFieldBool);
EXTENSIONS.register(0xA3, StructFieldText);

const EVD = new EvDecoder<ExtTestTarget>("ExtTestTarget")
  .setUnknown(EXTENSIONS.decodeUnknown);

class ExtTestTarget implements Extensible {
  public readonly [Extensible.TAG] = EXTENSIONS;
  public declare a1: number | undefined;
  public declare a2: boolean | undefined;
  public declare a3: string | undefined;

  public encodeTo(encoder: Encoder) {
    encoder.prependTlv(0xA0, ...EXTENSIONS.encode(this));
  }
}
Extensible.defineGettersSetters(ExtTestTarget, {
  a1: 0xA1,
  a2: 0xA2,
  a3: 0xA3,
});

test("encode", () => {
  const target = new ExtTestTarget();
  expect(target).toEncodeAs([
    0xA0, 0x00,
  ]);

  target.a1 = 5;
  target.a2 = true;
  target.a3 = "A3";
  expect(target).toEncodeAs([
    0xA0, 0x09,
    0xA2, 0x00,
    0xA3, 0x02, 0x41, 0x33,
    0xA1, 0x01, 0x05,
  ]);

  const target2 = new ExtTestTarget();
  Extensible.cloneRecord(target2, target);
  expect(target2).toEncodeAs([
    0xA0, 0x09,
    0xA2, 0x00,
    0xA3, 0x02, 0x41, 0x33,
    0xA1, 0x01, 0x05,
  ]);

  target.a1 = undefined;
  target.a2 = false;
  target.a3 = undefined;
  expect(target).toEncodeAs([
    0xA0, 0x00,
  ]);
});

test("decode", () => {
  let decoder = new Decoder(Uint8Array.of(
    0xA0, 0x03,
    0xA1, 0x01, 0x04,
  ));
  let obj = EVD.decode(new ExtTestTarget(), decoder);
  expect(obj.a1).toBe(4);
  expect(obj.a2).toBeUndefined();
  expect(obj.a3).toBeUndefined();

  decoder = new Decoder(Uint8Array.of(
    0xA0, 0x02,
    0xA2, 0x00,
  ));
  obj = EVD.decode(new ExtTestTarget(), decoder);
  expect(obj.a1).toBeUndefined();
  expect(obj.a2).toBe(true);
  expect(obj.a3).toBeUndefined();

  decoder = new Decoder(Uint8Array.of(
    0xA0, 0x04,
    0xA3, 0x02, 0x41, 0x33,
  ));
  obj = EVD.decode(new ExtTestTarget(), decoder);
  expect(obj.a1).toBeUndefined();
  expect(obj.a2).toBeUndefined();
  expect(obj.a3).toBe("A3");

  decoder = new Decoder(Uint8Array.of(
    0xA0, 0x02,
    0xA9, 0x00, // not matching any extension, critical
  ));
  expect(() => EVD.decode(new ExtTestTarget(), decoder)).toThrow();
});
