import "@ndn/name/test-fixture";
import "@ndn/tlv/test-fixture";

import { Name } from "@ndn/name";
import { Decoder, Encoder } from "@ndn/tlv";

import { KeyDigest, SigInfo, SigType, TT } from "../src";

test("encode", () => {
  expect(() => new SigInfo({} as any)).toThrow();

  let si = new SigInfo();
  expect(() => Encoder.encode(si.encodeAs(TT.ISigInfo))).toThrow();

  si.type = SigType.Sha256;
  expect(si.encodeAs(TT.ISigInfo)).toEncodeAs(({ type, value }) => {
    expect(type).toBe(TT.ISigInfo);
    expect(value).toMatchTlv(
      ({ type, value }) => {
        expect(type).toBe(TT.SigType);
        expect(value).toEqualUint8Array([SigType.Sha256]);
      },
    );
  });

  si = new SigInfo(SigType.Sha256WithRsa, "/KL");
  si.nonce = 0x59EF;
  si.time = new Date(1157512424208);
  si.seqNum = 0xF598C7;
  expect(si.encodeAs(TT.ISigInfo)).toEncodeAs(({ type, value }) => {
    expect(type).toBe(TT.ISigInfo);
    expect(value).toMatchTlv(
      ({ type, value }) => {
        expect(type).toBe(TT.SigType);
        expect(value).toEqualUint8Array([SigType.Sha256WithRsa]);
      },
      ({ type, value }) => {
        expect(type).toBe(TT.KeyLocator);
        expect(value).toMatchTlv(
          ({ decoder }) => { expect(decoder.decode(Name)).toEqualName("/KL"); },
        );
      },
      ({ type, length, value }) => {
        expect(type).toBe(TT.SigNonce);
        expect(length).toBe(4);
        expect(value).toEqualUint8Array([0x00, 0x00, 0x59, 0xEF]);
      },
      ({ type, value }) => {
        expect(type).toBe(TT.SigTime);
        expect(value).toEqualUint8Array([0x00, 0x00, 0x01, 0x0D, 0x81, 0x1D, 0xEB, 0x10]);
      },
      ({ type, value }) => {
        expect(type).toBe(TT.SigSeqNum);
        expect(value).toEqualUint8Array([0x00, 0xF5, 0x98, 0xC7]);
      },
    );
  });

  si.type = SigType.HmacWithSha256;
  si.keyLocator = new KeyDigest(new Uint8Array(32));
  si.nonce = undefined;
  si.time = undefined;
  si.seqNum = undefined;
  si = new SigInfo(si);
  expect(si.encodeAs(TT.DSigInfo)).toEncodeAs(({ type, value }) => {
    expect(type).toBe(TT.DSigInfo);
    expect(value).toMatchTlv(
      ({ type, value }) => {
        expect(type).toBe(TT.SigType);
        expect(value).toEqualUint8Array([SigType.HmacWithSha256]);
      },
      ({ type, value }) => {
        expect(type).toBe(TT.KeyLocator);
        expect(value).toMatchTlv(
          ({ type, length }) => {
            expect(type).toBe(TT.KeyDigest);
            expect(length).toBe(32);
          },
        );
      },
    );
  });
});

test("decode", () => {
  let decoder = new Decoder(Uint8Array.of(
    0x16, 0x03,
    0x1B, 0x01, 0x00,
  ));
  let si = decoder.decode(SigInfo);
  expect(si.type).toBe(SigType.Sha256);

  decoder = new Decoder(Uint8Array.of(
    0x16, 0x0B,
    0x1B, 0x01, 0x03,
    0x1C, 0x06, 0x07, 0x04, 0x08, 0x02, 0x4B, 0x4C,
  ));
  si = decoder.decode(SigInfo);
  expect(si.type).toBe(SigType.Sha256WithEcdsa);
  expect(si.keyLocator).toBeInstanceOf(Name);
  expect(si.keyLocator).toEqualName("/KL");

  decoder = new Decoder(Uint8Array.of(
    0x2C, 0x18,
    0x1B, 0x01, 0x04,
    0x1C, 0x05, 0x1D, 0x03, 0xA0, 0xA1, 0xA2,
    0x26, 0x04, 0xB0, 0xB1, 0xB2, 0xB3,
    0x28, 0x02, 0xC0, 0xC1,
    0x2A, 0x02, 0xD0, 0xD1,
  ));
  si = decoder.decode(SigInfo);
  expect(si.type).toBe(SigType.HmacWithSha256);
  expect(si.keyLocator).toBeInstanceOf(KeyDigest);
  expect((si.keyLocator as KeyDigest).value).toHaveLength(3);
  expect(si.nonce).toBe(0xB0B1B2B3);
  expect(si.time).toEqual(new Date(0xC0C1));
  expect(si.seqNum).toBe(0xD0D1);
});
