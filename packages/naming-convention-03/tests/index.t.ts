import { Name } from "@ndn/name";
import "@ndn/name/test-fixture";

import { ByteOffset, Keyword, Segment, SequenceNum, Timestamp, Version } from "../src";

test("Keyword", () => {
  const name = new Name().append(Keyword, "hello");
  expect(name.at(0)).toEqualComponent("32=hello");
  expect(name.at(0).is(Keyword)).toBeTruthy();
  expect(Keyword.parse(name.at(0))).toBe("hello");
});

test("Segment", () => {
  const name = new Name().append(Segment, 0x0101);
  expect(name.at(0)).toEqualComponent("33=%01%01");
  expect(name.at(0).is(Segment)).toBeTruthy();
  expect(Segment.parse(name.at(0))).toBe(0x0101);
});

test("ByteOffset", () => {
  const name = new Name().append(ByteOffset, 0x0102);
  expect(name.at(0)).toEqualComponent("34=%01%02");
  expect(name.at(0).is(ByteOffset)).toBeTruthy();
  expect(ByteOffset.parse(name.at(0))).toBe(0x0102);
});

test("Version", () => {
  const name = new Name().append(Version, 0x0103);
  expect(name.at(0)).toEqualComponent("35=%01%03");
  expect(name.at(0).is(Version)).toBeTruthy();
  expect(Version.parse(name.at(0))).toBe(0x0103);
});

test("Timestamp", () => {
  const name = new Name().append(Timestamp, new Date(540167400000))
                         .append(Timestamp, 540167400000009);
  expect(name.at(0)).toEqualComponent("36=%00%01%eb%47%85%ff%0a%00");
  expect(name.at(0).is(Timestamp)).toBeTruthy();
  expect(name.at(1)).toEqualComponent("36=%00%01%eb%47%85%ff%0a%09");
  expect(name.at(1).is(Timestamp)).toBeTruthy();
  expect(Timestamp.parse(name.at(0))).toEqual(540167400000000);
  expect(Timestamp.parseDate(name.at(0))).toEqual(new Date(540167400000));
  expect(Timestamp.parse(name.at(1))).toEqual(540167400000009);
  expect(Timestamp.parseDate(name.at(1))).toEqual(new Date(540167400000));
  expect(() => Timestamp.parseDate(name.at(1), true)).toThrow(/milliseconds/);
});

test("SequenceNum", () => {
  const name = new Name().append(SequenceNum, 0x0105);
  expect(name.at(0)).toEqualComponent("37=%01%05");
  expect(name.at(0).is(SequenceNum)).toBeTruthy();
  expect(SequenceNum.parse(name.at(0))).toBe(0x0105);
});
