import { Tlv, Encoder } from "../src";
import "../src/expect";

test("simple", () => {
  let tlv = new Tlv();
  expect(tlv.type).toBe(0);
  expect(tlv.length).toBe(0);
  expect(tlv.value).toEqualUint8Array([]);

  tlv = new Tlv(0x01);
  expect(tlv.type).toBe(0x01);
  expect(tlv.length).toBe(0);
  expect(tlv.value).toEqualUint8Array([]);

  tlv = new Tlv(new Uint8Array([0x02, 0x00]))
  expect(tlv.type).toBe(0x02);
  expect(tlv.length).toBe(0);
  expect(tlv.value).toEqualUint8Array([]);

  tlv = new Tlv(0x03, new Uint8Array([0xA0, 0xA1, 0xA2]))
  expect(tlv.type).toBe(0x03);
  expect(tlv.length).toBe(3);
  expect(tlv.value).toEqualUint8Array([0xA0, 0xA1, 0xA2]);
});

test("encode", () => {
  const encoder = new Encoder();
  encoder.encode(new Tlv(0x00FF, new Uint8Array([0xA0])));
  encoder.encode(new Tlv(0x01, Buffer.from([0xB0, 0xB1])));
  const output = encoder.output;
  expect(output).toHaveLength(9);
  expect(output).toEqualUint8Array([
    0x01, 0x02, 0xB0, 0xB1,
    0xFD, 0x00, 0xFF, 0x01, 0xA0,
  ]);
});
