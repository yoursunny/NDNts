import "@ndn/packet/test-fixture/expect";

import { Component, Name } from "@ndn/packet";
import { expect, test } from "vitest";

import { ByteOffset, Segment, SequenceNum, Timestamp, Version } from "..";

interface Row {
  marker: number;
  convention: typeof Segment;
}

const TABLE: Row[] = [
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
];

test.each(TABLE)("%j", ({ marker, convention }) => {
  const markerHex = marker.toString(16).padStart(2, "0");
  const name = new Name().append(convention, 0x00010203).append(convention, 0x0405n);
  expect(name.at(0)).toEqualComponent(`%${markerHex}%00%01%02%03`);
  expect(name.at(0).is(convention)).toBeTruthy();
  expect(name.at(0).as(convention)).toBe(0x00010203);
  expect(name.at(1)).toEqualComponent(`%${markerHex}%04%05`);
  expect(name.at(1).is(convention)).toBeTruthy();
  expect(name.at(1).as(convention)).toBe(0x0405);

  expect(new Component(0x20, name.at(0).value).is(convention)).toBeFalsy();
  expect(new Component(name.at(0).type, name.at(0).value.subarray(0, 4)).is(convention)).toBeFalsy();
});
