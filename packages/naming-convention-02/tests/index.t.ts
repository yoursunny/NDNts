import { Component, Name, NamingConvention } from "@ndn/name";
import "@ndn/name/test-fixture";

import { ByteOffset, Segment, SequenceNum, Timestamp, Version } from "../src";

interface Row {
  marker: number;
  convention: NamingConvention<number, number>;
}

const TABLE = [
  {
    marker: 0x00,
    convention: Segment,
  },
  {
    marker: 0xFB,
    convention: ByteOffset,
  },
  {
    marker: 0xFD,
    convention: Version,
  },
  {
    marker: 0xFC,
    convention: Timestamp,
  },
  {
    marker: 0xFE,
    convention: SequenceNum,
  },
] as Row[];

test.each(TABLE)("%p", ({ marker, convention }) => {
  const name = new Name().append(convention, 0x00010203);
  expect(name.at(0)).toEqualComponent(`%${marker.toString(16).padStart(2, "0")}%00%01%02%03`);
  expect(name.at(0).is(convention)).toBeTruthy();
  expect(name.at(0).as(convention)).toBe(0x00010203);

  expect(new Component(0x20, name.at(0).value).is(convention)).toBeFalsy();
  expect(new Component(name.at(0).type, name.at(0).value.subarray(0, 4)).is(convention)).toBeFalsy();
});
