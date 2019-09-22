import { Name } from "@ndn/name";
import { Decoder, Encoder } from "@ndn/tlv";
import "@ndn/tlv/test-fixture";

import { Interest } from "../src";

test("encode", () => {
  expect(() => new Interest({} as any)).toThrow();

  let interest = new Interest();
  expect(() => Encoder.encode(interest)).toThrow();

  interest = new Interest("/A");
  expect(interest.name.toString()).toEqual("/A");
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
  expect(interest.name.toString()).toEqual("/B");
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

test("decode", () => {
  let decoder = new Decoder(new Uint8Array([
    0x05, 0x05,
    0x07, 0x03, 0x08, 0x01, 0x41,
  ]));
  let interest = decoder.decode(Interest);
  expect(interest.name.toString()).toBe("/A");
  expect(interest.canBePrefix).toBeFalsy();
  expect(interest.mustBeFresh).toBeFalsy();

  decoder = new Decoder(new Uint8Array([
    0x05, 0x16,
    0x07, 0x03, 0x08, 0x01, 0x41,
    0x21, 0x00,
    0x12, 0x00,
    // TODO ForwardingHint
    0x0A, 0x04, 0xA0, 0xA1, 0xA2, 0xA3,
    0x0C, 0x02, 0x76, 0xA1,
    0x22, 0x01, 0xDC,
    // TODO AppParameters, ISigInfo, ISigValue
  ]));
  interest = decoder.decode(Interest);
  expect(interest.name.toString()).toBe("/A");
  expect(interest.canBePrefix).toBeTruthy();
  expect(interest.mustBeFresh).toBeTruthy();
  expect(interest.nonce).toBe(0xA0A1A2A3);
  expect(interest.lifetime).toBe(30369);
  expect(interest.hopLimit).toBe(220);
});
