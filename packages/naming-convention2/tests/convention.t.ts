import "@ndn/packet/test-fixture/expect";

import { Name } from "@ndn/packet";
import { expect, test } from "vitest";

import { AltUri, ByteOffset, GenericNumber, Keyword, Segment, SequenceNum, Timestamp, Version } from "..";

test("GenericNumber", () => {
  expect(GenericNumber.type).toBe(0x08);
  const name = new Name().append(GenericNumber, 0x38);
  expect(name.at(0)).toEqualComponent("8");
  expect(name.at(0).is(GenericNumber)).toBeTruthy();
  expect(name.at(0).as(GenericNumber)).toBe(0x38);
  expect(AltUri.ofName(name)).toBe("/8");
});

test("Keyword", () => {
  expect(Keyword.type).toBe(0x20);
  const name = new Name().append(Keyword, "hello");
  expect(name.at(0)).toEqualComponent("32=hello");
  expect(name.at(0).is(Keyword)).toBeTruthy();
  expect(name.at(0).as(Keyword)).toBe("hello");
  expect(AltUri.ofName(name)).toBe("/32=hello");
  expect(AltUri.parseName("/32=hello")).toEqualName(name);
});

test("Segment", () => {
  expect(Segment.type).toBe(0x32);
  const name = new Name().append(Segment, 0x0101);
  expect(name.at(0)).toEqualComponent("50=%01%01");
  expect(name.at(0).is(Segment)).toBeTruthy();
  expect(name.at(0).as(Segment)).toBe(0x0101);
  expect(AltUri.ofName(name)).toBe("/seg=257");
  expect(AltUri.parseName("/seg=257")).toEqualName(name);
});

test("ByteOffset", () => {
  expect(ByteOffset.type).toBe(0x34);
  expect(ByteOffset.big.type).toBe(0x34);
  const name = new Name().append(ByteOffset, 0x0102).append(ByteOffset, 0xFFFFFFFFFFFF0102n);
  expect(name.at(0)).toEqualComponent("52=%01%02");
  expect(name.at(0).is(ByteOffset)).toBeTruthy();
  expect(name.at(0).as(ByteOffset)).toBe(0x0102);
  expect(name.at(1)).toEqualComponent("52=%FF%FF%FF%FF%FF%FF%01%02");
  expect(name.at(1).is(ByteOffset.big)).toBeTruthy();
  expect(name.at(1).as(ByteOffset.big)).toBe(0xFFFFFFFFFFFF0102n);
  expect(AltUri.ofName(name)).toBe("/off=258/off=18446744073709486338");
  expect(AltUri.parseName("/off=258/off=18446744073709486338")).toEqualName(name);
});

test("Version", () => {
  expect(Version.type).toBe(0x36);
  const name = new Name().append(Version, 0x0103);
  expect(name.at(0)).toEqualComponent("54=%01%03");
  expect(name.at(0).is(Version)).toBeTruthy();
  expect(name.at(0).as(Version)).toBe(0x0103);
  expect(AltUri.ofName(name)).toBe("/v=259");
  expect(AltUri.parseName("/v=259")).toEqualName(name);
});

test("Timestamp", () => {
  expect(Timestamp.type).toBe(0x38);
  expect(Timestamp.ms.type).toBe(0x38);
  expect(Timestamp.us.type).toBe(0x38);

  const name = new Name().append(Timestamp, new Date(540167400_000))
    .append(Timestamp.us, 1570239360_127447)
    .append(Timestamp.us, Number.MAX_SAFE_INTEGER);

  expect(name.at(0)).toEqualComponent("56=%00%01%eb%47%85%ff%0a%00");
  expect(name.at(0).is(Timestamp)).toBeTruthy();
  expect(name.at(0).as(Timestamp)).toEqual(540167400_000);
  expect(name.at(0).as(Timestamp.ms)).toEqual(540167400_000);
  expect(name.at(0).as(Timestamp.us)).toEqual(540167400_000000);

  expect(name.at(1)).toEqualComponent("56=%00%05%94%1f%d7%45%d1%d7");
  expect(name.at(1).is(Timestamp)).toBeTruthy();
  expect(name.at(1).as(Timestamp)).toEqual(1570239360_127.447);
  expect(name.at(1).as(Timestamp.ms)).toEqual(1570239360_127.447);
  expect(name.at(1).as(Timestamp.us)).toEqual(1570239360_127447);

  expect(name.at(2).is(Timestamp.ms)).toBeTruthy();
  expect(() => name.at(2).as(Timestamp.ms)).toThrow(/large/);
  expect(name.at(2).as(Timestamp.us)).toBe(Number.MAX_SAFE_INTEGER);

  const name2 = name.getPrefix(2);
  expect(AltUri.ofName(name2)).toBe("/t=540167400000000/t=1570239360127447");
  expect(AltUri.parseName("/t=540167400000000/t=1570239360127447")).toEqualName(name2);
});

test("SequenceNum", () => {
  expect(SequenceNum.type).toBe(0x3A);
  const name = new Name().append(SequenceNum, 0x0105);
  expect(name.at(0)).toEqualComponent("58=%01%05");
  expect(name.at(0).is(SequenceNum)).toBeTruthy();
  expect(name.at(0).as(SequenceNum)).toBe(0x0105);
  expect(AltUri.ofName(name)).toBe("/seq=261");
  expect(AltUri.parseName("/seq=261")).toEqualName(name);
});
