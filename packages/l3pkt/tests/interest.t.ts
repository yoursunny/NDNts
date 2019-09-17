import { Name } from "@ndn/name";
import { Decoder } from "@ndn/tlv";
import "@ndn/tlv/test-fixture";

import { Interest } from "../src";

test("encode", () => {
  expect(() => new Interest({} as any)).toThrow();

  let interest = new Interest("/A");
  expect(interest.name.toString()).toEqual("/A");
  expect(interest.canBePrefix).toBeFalsy();
  expect(interest.mustBeFresh).toBeFalsy();
  expect(interest).toEncodeAs([
    0x05, 0x0B,
    0x07, 0x03, 0x08, 0x01, 0x41,
    0x0A, 0x04, undefined, undefined, undefined, undefined,
  ]);

  interest = new Interest("/B", Interest.CanBePrefix, Interest.MustBeFresh);
  expect(interest.name.toString()).toEqual("/B");
  expect(interest.canBePrefix).toBeTruthy();
  expect(interest.mustBeFresh).toBeTruthy();
  expect(interest).toEncodeAs([
    0x05, 0x0F,
    0x07, 0x03, 0x08, 0x01, 0x42,
    0x21, 0x00,
    0x12, 0x00,
    0x0A, 0x04, undefined, undefined, undefined, undefined,
  ]);

  interest.name = new Name("C");
  interest.canBePrefix = false;
  interest.mustBeFresh = false;
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
});
