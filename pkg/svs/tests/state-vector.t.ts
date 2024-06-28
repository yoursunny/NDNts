import "@ndn/packet/test-fixture/expect";

import { Name } from "@ndn/packet";
import { Decoder, Encoder } from "@ndn/tlv";
import { fromHex } from "@ndn/util";
import { expect, test } from "vitest";

import { StateVector } from "..";

const name1 = new Name("/one");
const name2 = new Name("/two");
const name4 = new Name("/four");
const name5 = new Name("/five");

test("basic", () => {
  const v0 = new StateVector({
    [name1.valueHex]: 1,
    [name2.valueHex]: 2,
  });

  expect(v0.get(name1)).toBe(1);
  const entry2 = v0.getEntry(name2);
  expect(entry2.seqNum).toBe(2);
  expect(entry2.lastUpdate).toBe(0);
  expect(v0.get(name5)).toBe(0);
  expect(v0.getEntry(name5).lastUpdate).toBe(0);

  const wire = fromHex("C918CA0A070508036F6E65CC0101CA0A0705080374776FCC0102");
  expect(Encoder.encode(v0)).toEqualUint8Array(wire);

  const t0 = Date.now();
  v0.set(name4, 44);
  expect(v0.get(name4)).toBe(44);
  expect(v0.getEntry(name4).lastUpdate).toBeGreaterThanOrEqual(t0);

  const v1 = new StateVector();
  v1.set(name2, 2);
  v1.set(name1, 1);

  expect(Encoder.encode(v1)).toEqualUint8Array(wire);

  const v2 = Decoder.decode(wire, StateVector);
  const iterated = Array.from(v2);
  expect(iterated).toHaveLength(2);
  expect(iterated[0][0]).toEqualName(name1);
  expect(iterated[0][1]).toBe(1);
  expect(iterated[1][0]).toEqualName(name2);
  expect(iterated[1][1]).toBe(2);
});

test("compare-merge", () => {
  const v0 = new StateVector({
    [name1.valueHex]: 10,
    [name2.valueHex]: 29,
  });
  const v1 = new StateVector({
    [name1.valueHex]: 12,
    [name2.valueHex]: 22,
    [name4.valueHex]: 40,
  });

  expect(v0.listOlderThan(v0)).toHaveLength(0);
  v0.mergeFrom(v0);
  expect(v0.listOlderThan(v0)).toHaveLength(0);

  expect(v1.listOlderThan(v1)).toHaveLength(0);

  const o01 = v0.listOlderThan(v1);
  expect(o01).toHaveLength(2);
  o01.sort((a, b) => a.id.compare(b.id));
  expect(o01[0].id).toEqualName(name1);
  expect(o01[0].loSeqNum).toBe(11);
  expect(o01[0].hiSeqNum).toBe(12);
  expect(o01[1].id).toEqualName(name4);
  expect(o01[1].loSeqNum).toBe(1);
  expect(o01[1].hiSeqNum).toBe(40);

  const o10 = v1.listOlderThan(v0);
  expect(o10).toHaveLength(1);
  expect(o10[0].id).toEqualName(name2);
  expect(o10[0].loSeqNum).toBe(23);
  expect(o10[0].hiSeqNum).toBe(29);

  const v0m = new StateVector(v0);
  v0m.mergeFrom(v1);
  expect(v0m.toJSON()).toEqual({
    [name1.valueHex]: 12,
    [name2.valueHex]: 29,
    [name4.valueHex]: 40,
  });

  const v1m = new StateVector(v1);
  v1m.mergeFrom(v0);
  expect(v1m.toJSON()).toEqual({
    [name1.valueHex]: 12,
    [name2.valueHex]: 29,
    [name4.valueHex]: 40,
  });
});
