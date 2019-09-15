import { Decoder, NNI } from "@ndn/tlv";
import "@ndn/tlv/lib/expect";

import { Data } from "../src";
import { Name } from "@ndn/name";
import { TT } from "@ndn/tt-base";

test("encode", () => {
  expect(() => { new Data({} as any); }).toThrow();

  let data = new Data("/A");
  expect(data.name.toString()).toEqual("/A");
  expect(data.freshnessPeriod).toBe(0);
  expect(data.content).toHaveLength(0);
  expect(data).toEncodeAs(({ type, value }) => {
    expect(type).toBe(TT.Data);
    expect(value).toMatchTlv(
      ({ decoder }) => { expect(decoder.decode(Name).toString()).toBe("/A"); },
      ({ type }) => { expect(type).toBe(TT.DSigInfo); },
      ({ type }) => { expect(type).toBe(TT.DSigValue); },
    );
  });

  data = new Data("/B", Data.FreshnessPeriod(2500), new Uint8Array([0xC0, 0xC1]));
  expect(data.name.toString()).toEqual("/B");
  expect(data.freshnessPeriod).toBe(2500);
  expect(data.content).toHaveLength(2);
  expect(data.content).toEqualUint8Array([0xC0, 0xC1]);
  expect(data).toEncodeAs(({ type, value }) => {
    expect(type).toBe(TT.Data);
    expect(value).toMatchTlv(
      ({ decoder }) => { expect(decoder.decode(Name).toString()).toBe("/B"); },
      ({ type, value }) => {
        expect(type).toBe(TT.MetaInfo);
        expect(value).toMatchTlv(
          ({ type, value }) => {
            expect(type).toBe(TT.FreshnessPeriod);
            expect(NNI.decode(value)).toBe(2500);
          }
        );
      },
      ({ type, length }) => {
        expect(type).toBe(TT.Content);
        expect(length).toBe(2);
      },
      ({ type }) => { expect(type).toBe(TT.DSigInfo); },
      ({ type }) => { expect(type).toBe(TT.DSigValue); },
    );
  });

  data.name = new Name("/C");
  expect(() => { data.freshnessPeriod = -1; }).toThrow();
  data.freshnessPeriod = 0;
  data.content = new Uint8Array([0xC2, 0xC3]);
  expect(data).toEncodeAs(({ type, value }) => {
    expect(type).toBe(TT.Data);
    expect(value).toMatchTlv(
      ({ decoder }) => { expect(decoder.decode(Name).toString()).toBe("/C"); },
      ({ value }) => { expect(value).toEqualUint8Array([0xC2, 0xC3]); },
      ({ type }) => { expect(type).toBe(TT.DSigInfo); },
      ({ type }) => { expect(type).toBe(TT.DSigValue); },
    );
  });
});

test("decode", () => {
  let decoder = new Decoder(new Uint8Array([
    0x06, 0x05,
    0x07, 0x03, 0x08, 0x01, 0x41,
  ]));
  let data = decoder.decode(Data);
  expect(data.name.toString()).toBe("/A");
  expect(data.content).toHaveLength(0);

  decoder = new Decoder(new Uint8Array([
    0x06, 0x13,
    0x07, 0x03, 0x08, 0x01, 0x42,
    0x14, 0x04, 0x19, 0x02, 0x01, 0x04,
    0x15, 0x02, 0xC0, 0xC1,
    0x16, 0x00,
    0x17, 0x00,
  ]));
  data = decoder.decode(Data);
  expect(data.name.toString()).toBe("/B");
  expect(data.content).toHaveLength(2);
});
