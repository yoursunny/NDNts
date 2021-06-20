import "../test-fixture/expect";

import { Encoder } from "..";

test("prependRoom", () => {
  const encoder = new Encoder(7);
  let output = encoder.output;
  expect(output).toBeInstanceOf(Uint8Array);
  expect(output).toHaveLength(0);
  expect(output.byteOffset).toBe(7);
  expect(output.byteLength).toBe(0);

  let room = encoder.prependRoom(4);
  expect(room).toBeInstanceOf(Uint8Array);
  expect(room).not.toBeInstanceOf(Buffer);
  expect(room).toHaveLength(4);
  Encoder.asDataView(room).setUint32(0, 0xA0A1A2A3);

  output = encoder.output;
  expect(output).toHaveLength(4);
  expect(output.byteOffset).toBe(3);
  expect(output.byteLength).toBe(4);
  expect(output).toEqualUint8Array([0xA0, 0xA1, 0xA2, 0xA3]);

  room = encoder.prependRoom(5);
  expect(room).toHaveLength(5);
  Encoder.asDataView(room).setUint32(1, 0xB0B1B2B3);
  room[0] = 0xC0;

  output = encoder.output;
  expect(output).toHaveLength(9);
  expect(output.byteOffset).toBeGreaterThan(1024);
  expect(output.byteLength).toBe(9);
  expect(output).toEqualUint8Array([0xC0, 0xB0, 0xB1, 0xB2, 0xB3, 0xA0, 0xA1, 0xA2, 0xA3]);
});

test("prependTlv", () => {
  const encoder = new Encoder(5);
  encoder.prependTlv(0x10000,
    [0x0100, Uint8Array.of(0xB0, 0xB1)],
    [0x01, Buffer.from([0xA0, 0xA1])],
    [0x02, Encoder.OmitEmpty, new Uint8Array(), undefined],
    [0x03],
  );
  expect(encoder).toEncodeAs([
    0xFE, 0x00, 0x01, 0x00, 0x00, 0x0C,
    0xFD, 0x01, 0x00, 0x02, 0xB0, 0xB1,
    0x01, 0x02, 0xA0, 0xA1,
    0x03, 0x00,
  ]);
  expect(encoder).toEncodeAs(({ type, length, value }) => {
    expect(type).toBe(0x10000);
    expect(length).toBe(12);
    expect(value).toMatchTlv(
      ({ type }) => { expect(type).toBe(0x0100); },
      ({ type }) => { expect(type).toBe(0x01); },
      ({ type }) => { expect(type).toBe(0x03); },
    );
  });
});

test("encode Encodable[] and extract", () => {
  const extractCb = jest.fn<void, [Uint8Array]>();
  expect(Encoder.encode([
    undefined,
    Uint8Array.of(0xF0),
    Encoder.extract(
      [0x02, Uint8Array.of(0x20, 0x21, 0x22)],
      extractCb,
    ),
  ])).toEqualUint8Array([0xF0, 0x02, 0x03, 0x20, 0x21, 0x22]);
  expect(extractCb).toBeCalledTimes(1);
  expect(extractCb.mock.calls[0]![0]).toEqualUint8Array([0x02, 0x03, 0x20, 0x21, 0x22]);
});

test("error on VAR-NUMBER-9", () => {
  const encoder = new Encoder();
  expect(() => encoder.prependTypeLength(0x01, 0x100000000)).toThrow();
});

test("error on not Encodable", () => {
  const encoder = new Encoder();
  expect(() => encoder.encode({} as any)).toThrow();
});

test("DataView helper", () => {
  const { getBigUint64, setBigUint64 } = Encoder.DataViewPolyfill;

  const ab = new ArrayBuffer(64);
  const u8 = new Uint8Array(ab, 16, 31);
  const dv = Encoder.asDataView(u8);
  expect(dv.buffer).toBe(ab);
  expect(dv.byteOffset).toBe(16);
  expect(dv.byteLength).toBe(31);

  setBigUint64(dv, 0, 0xA0A1A2A3A4A5A6A7n);
  setBigUint64(dv, 8, 0xB0B1B2B3B4B5B6B7n, false);
  setBigUint64(dv, 16, 0xC0C1C2C3C4C5C6C7n, true);
  expect(() => setBigUint64(dv, 24, 0xD0D1D2D3D4D5D6D7n)).toThrow(RangeError);
  expect(u8).toEqualUint8Array([
    0xA0, 0xA1, 0xA2, 0xA3, 0xA4, 0xA5, 0xA6, 0xA7, //
    0xB0, 0xB1, 0xB2, 0xB3, 0xB4, 0xB5, 0xB6, 0xB7, //
    0xC7, 0xC6, 0xC5, 0xC4, 0xC3, 0xC2, 0xC1, 0xC0, //
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, //
  ]);
  expect(getBigUint64(dv, 0)).toBe(0xA0A1A2A3A4A5A6A7n);
  expect(getBigUint64(dv, 8, false)).toBe(0xB0B1B2B3B4B5B6B7n);
  expect(getBigUint64(dv, 16, true)).toBe(0xC0C1C2C3C4C5C6C7n);
  expect(() => getBigUint64(dv, 24)).toThrow(RangeError);
});
