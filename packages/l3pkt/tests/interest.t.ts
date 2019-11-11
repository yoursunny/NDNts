import "@ndn/name/test-fixture";
import "@ndn/tlv/test-fixture";

import { Name, ParamsDigest } from "@ndn/name";
import { Decoder, Encoder } from "@ndn/tlv";

import { Interest, LLSign, LLVerify, SigInfo, SigType, TT } from "..";

test("encode", () => {
  expect(() => new Interest({} as any)).toThrow();

  let interest = new Interest();
  expect(() => Encoder.encode(interest)).toThrow();

  interest = new Interest("/A");
  expect(interest.name).toEqualName("/A");
  expect(interest.canBePrefix).toBeFalsy();
  expect(interest.mustBeFresh).toBeFalsy();
  expect(interest.nonce).toBeUndefined();
  expect(interest.lifetime).toBe(4000);
  expect(interest.hopLimit).toBe(255);
  expect(interest).toEncodeAs([
    0x05, 0x0B,
    0x07, 0x03, 0x08, 0x01, 0x41,
    0x0A, 0x04, undefined, undefined, undefined, undefined,
  ]);
  expect(interest.nonce).toBeUndefined();

  interest = new Interest("/B", Interest.CanBePrefix, Interest.MustBeFresh,
                          Interest.Nonce(0x85AC8579), Interest.Lifetime(8198), Interest.HopLimit(5));
  expect(interest.name).toEqualName("/B");
  expect(interest.canBePrefix).toBeTruthy();
  expect(interest.mustBeFresh).toBeTruthy();
  expect(interest.nonce).not.toBeUndefined();
  expect(interest.nonce).toBe(0x85AC8579);
  expect(interest.lifetime).toBe(8198);
  expect(interest.hopLimit).toBe(5);
  expect(interest).toEncodeAs([
    0x05, 0x16,
    0x07, 0x03, 0x08, 0x01, 0x42,
    0x21, 0x00,
    0x12, 0x00,
    0x0A, 0x04, 0x85, 0xAC, 0x85, 0x79,
    0x0C, 0x02, 0x20, 0x06,
    0x22, 0x01, 0x05,
  ]);

  interest.name = new Name("C");
  interest.canBePrefix = false;
  interest.mustBeFresh = false;
  interest.nonce = undefined;
  interest.lifetime = 4000;
  interest.hopLimit = 255;
  interest = new Interest(interest);
  expect(interest).toEncodeAs([
    0x05, 0x0B,
    0x07, 0x03, 0x08, 0x01, 0x43,
    0x0A, 0x04, undefined, undefined, undefined, undefined,
  ]);
});

test("decode", async () => {
  let decoder = new Decoder(Uint8Array.of(
    0x05, 0x05,
    0x07, 0x03, 0x08, 0x01, 0x41,
  ));
  let interest = decoder.decode(Interest);
  expect(interest.name).toEqualName("/A");
  expect(interest.canBePrefix).toBeFalsy();
  expect(interest.mustBeFresh).toBeFalsy();

  decoder = new Decoder(Uint8Array.of(
    0x05, 0x16,
    0x07, 0x03, 0x08, 0x01, 0x41,
    0x21, 0x00,
    0x12, 0x00,
    // TODO ForwardingHint
    0x0A, 0x04, 0xA0, 0xA1, 0xA2, 0xA3,
    0x0C, 0x02, 0x76, 0xA1,
    0x22, 0x01, 0xDC,
  ));
  interest = decoder.decode(Interest);
  expect(interest.name).toEqualName("/A");
  expect(interest.canBePrefix).toBeTruthy();
  expect(interest.mustBeFresh).toBeTruthy();
  expect(interest.nonce).toBe(0xA0A1A2A3);
  expect(interest.lifetime).toBe(30369);
  expect(interest.hopLimit).toBe(220);
  expect(interest.appParameters).toBeUndefined();
  expect(interest.sigInfo).toBeUndefined();
  expect(interest.sigValue).toBeUndefined();

  // noop for non parameterized Interest
  await expect(interest.validateParamsDigest()).resolves.toBeUndefined();
});

async function encodeWithLLSign(interest: Interest): Promise<Uint8Array> {
  await interest[LLSign.PROCESS]();
  return Encoder.encode(interest);
}

test("encode parameterized", async () => {
  // insert empty AppParameters
  let interest = new Interest(new Name("/A").append(ParamsDigest.PLACEHOLDER).append("C"));
  await expect(encodeWithLLSign(interest)).resolves.toEncodeAs(({ value }) => {
    expect(value).toMatchTlv(
      ({ decoder }) => {
        const name = decoder.decode(Name);
        expect(name.length).toBe(3);
        expect(name.at(1).is(ParamsDigest)).toBeTruthy();
      },
      ({ type }) => expect(type).toBe(TT.Nonce),
      ({ type, length }) => {
        expect(type).toBe(TT.AppParameters);
        expect(length).toBe(0);
      },
    );
  });

  // append ParamsDigest
  interest = new Interest(new Name("/A"), Uint8Array.of(0xC0, 0xC1));
  await interest.updateParamsDigest();
  expect(interest.name.length).toBe(2);
  expect(interest.name.at(1).is(ParamsDigest)).toBeTruthy();
  expect(Encoder.encode(interest)).toBeInstanceOf(Uint8Array);

  // cannot validate unless Interest comes from decoding
  await expect(interest.validateParamsDigest()).rejects.toThrow(/empty/);
});

test("decode parameterized", async () => {
  let decoder = new Decoder(Encoder.encode([
    TT.Interest,
    new Name("/A"),
    [TT.AppParameters, Uint8Array.of(0xC0, 0xC1)],
  ]));
  expect(() => decoder.decode(Interest)).toThrow(/missing/);

  decoder = new Decoder(Encoder.encode([
    TT.Interest,
    new Name("/A").append(ParamsDigest, new Uint8Array(32)),
    [TT.AppParameters, Uint8Array.of(0xC0, 0xC1)],
  ]));
  let interest = decoder.decode(Interest);
  expect(interest.name.length).toBe(2);
  expect(interest.appParameters).not.toBeUndefined();

  const wire = await encodeWithLLSign(new Interest(
    new Name("/A").append(ParamsDigest.PLACEHOLDER).append("C"),
    Uint8Array.of(0xC0, 0xC1),
  ));
  decoder = new Decoder(wire);
  interest = decoder.decode(Interest);
  expect(interest.name.length).toBe(3);
  expect(interest.appParameters).not.toBeUndefined();

  const verify = jest.fn();
  await expect(interest[LLVerify.VERIFY](verify)).resolves.toBeUndefined();
  expect(verify).not.toHaveBeenCalled();

  await expect(interest.validateParamsDigest()).resolves.toBeUndefined();

  decoder = new Decoder(wire);
  interest = decoder.decode(Interest);
  interest.name = interest.name.replaceAt(1, ParamsDigest.create(new Uint8Array(32)));
  await expect(interest.validateParamsDigest()).rejects.toThrow(/incorrect/);
});

test("encode signed", async () => {
  // error on out of place ParamsDigest
  const interest = new Interest(new Name("/A").append(ParamsDigest.PLACEHOLDER).append("C"));
  interest.sigInfo = new SigInfo(SigType.Sha256);
  await expect(encodeWithLLSign(interest)).rejects.toThrow(/out of place/);

  // other tests in llsign.t.ts
});

test("decode signed", () => {
  let decoder = new Decoder(Encoder.encode([
    TT.Interest,
    new Name("/A").append(ParamsDigest, new Uint8Array(32)),
    [TT.ISigValue, new Uint8Array(4)],
  ]));
  expect(() => decoder.decode(Interest)).toThrow(/missing/);

  decoder = new Decoder(Encoder.encode([
    TT.Interest,
    new Name("/A").append(ParamsDigest, new Uint8Array(32)),
    [TT.AppParameters, Uint8Array.of(0xC0, 0xC1)],
    [TT.ISigValue, new Uint8Array(4)],
  ]));
  expect(() => decoder.decode(Interest)).toThrow(/missing/);

  decoder = new Decoder(Encoder.encode([
    TT.Interest,
    new Name("/A").append(ParamsDigest, new Uint8Array(32)).append("C"),
    [TT.AppParameters, Uint8Array.of(0xC0, 0xC1)],
    new SigInfo(SigType.Sha256).encodeAs(TT.ISigInfo),
    [TT.ISigValue, new Uint8Array(4)],
  ]));
  expect(() => decoder.decode(Interest)).toThrow(/out of place/);

  decoder = new Decoder(Encoder.encode([
    TT.Interest,
    new Name("/A").append(ParamsDigest, new Uint8Array(32)),
    [TT.AppParameters, Uint8Array.of(0xC0, 0xC1)],
    new SigInfo(SigType.Sha256).encodeAs(TT.ISigInfo),
    [TT.ISigValue, new Uint8Array(4)],
  ]));
  const interest = decoder.decode(Interest);
  expect(interest.name.length).toBe(2);
  expect(interest.appParameters).not.toBeUndefined();
  expect(interest.sigInfo).not.toBeUndefined();
  expect(interest.sigValue).not.toBeUndefined();
});

describe("decode Selectors", () => {
  const input = Uint8Array.of(
    0x05, 0x0A,
    0x07, 0x03, 0x08, 0x01, 0x41,
    0x09, 0x03, 0x11, 0x01, 0x01,
  );

  afterEach(() => Interest.tolerateSelectors = false);

  test("error on Selectors", () => {
    expect(() => new Decoder(input).decode(Interest)).toThrow(/Selectors/);
  });

  test("tolerate Selectors", () => {
    Interest.tolerateSelectors = true;
    const interest = new Decoder(input).decode(Interest);
    expect(interest.name).toEqualName("/A");
  });
});
