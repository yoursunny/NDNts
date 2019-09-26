import { Encoder } from "../src";
import "../test-fixture";

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
    [0x0100, new Uint8Array([0xB0, 0xB1])],
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
    new Uint8Array([0xF0]),
    Encoder.extract(
      [0x02, new Uint8Array([0x20, 0x21, 0x22])],
      extractCb,
    ),
  ])).toEqualUint8Array([0xF0, 0x02, 0x03, 0x20, 0x21, 0x22]);
  expect(extractCb).toBeCalledTimes(1);
  expect(extractCb.mock.calls[0][0]).toEqualUint8Array([0x02, 0x03, 0x20, 0x21, 0x22]);
});

test("error on VAR-NUMBER-9", () => {
  const encoder = new Encoder();
  expect(() => encoder.prependTypeLength(0x01, 0x100000000)).toThrow();
});

test("error on not Encodable", () => {
  const encoder = new Encoder();
  expect(() => encoder.encode({} as any)).toThrow();
});
