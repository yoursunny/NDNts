import "@ndn/tlv/test-fixture/expect";

import { fromHex } from "@ndn/tlv";

import { IBLT, makePSyncCompatParam } from "..";

const paramCompat10 = makePSyncCompatParam({ expectedEntries: 10 }).iblt;

test("serialize", () => {
  const iblt0 = new IBLT(paramCompat10);
  iblt0.insert(0xF6A77ABA);
  const wire0 = iblt0.serialize();
  expect(wire0).toEqualUint8Array(fromHex("00000001F6A77ABA6BA34D6300000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001F6A77ABA6BA34D6300000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001F6A77ABA6BA34D63000000000000000000000000000000000000000000000000"));

  const iblt1 = new IBLT(paramCompat10);
  iblt1.deserialize(wire0);

  const iblt2 = new IBLT(makePSyncCompatParam({ expectedEntries: 20 }).iblt);
  expect(() => iblt2.deserialize(wire0)).toThrow();
});

test("insert erase", () => {
  const hash1 = 0xF6A77ABA;
  const hash2 = 0xF02401BF;
  const hash3 = 0x23929564;

  const iblt1 = new IBLT(paramCompat10);
  iblt1.insert(hash1);

  const iblt2 = new IBLT(paramCompat10);
  iblt2.deserialize(iblt1.serialize());
  iblt2.erase(hash1);
  iblt2.insert(hash2);

  iblt1.erase(hash1);
  iblt1.insert(hash3);

  iblt2.erase(hash2);
  iblt2.insert(hash3);

  expect(iblt1.serialize()).toEqualUint8Array(iblt2.serialize());
});

test("diff short", () => {
  const iblt1 = new IBLT(paramCompat10);
  const iblt2 = new IBLT(paramCompat10);

  {
    const { success, positive, negative } = iblt1.diff(iblt2);
    expect(success).toBeTruthy();
    expect(positive.size).toBe(0);
    expect(negative.size).toBe(0);
  }

  const hash1 = 0xF6A77ABA;
  const hash2 = 0x83C66647;

  iblt1.insert(hash1);
  {
    const { success, positive, negative } = iblt1.diff(iblt2);
    expect(success).toBeTruthy();
    expect(Array.from(positive)).toStrictEqual([hash1]);
    expect(negative.size).toBe(0);
  }

  iblt2.insert(hash2);
  {
    const { success, positive, negative } = iblt1.diff(iblt2);
    expect(success).toBeTruthy();
    expect(Array.from(positive)).toStrictEqual([hash1]);
    expect(Array.from(negative)).toStrictEqual([hash2]);
  }
});

test("diff long", () => {
  const iblt1 = new IBLT(paramCompat10);
  const iblt2 = new IBLT(paramCompat10);

  for (let i = 0; i < 40; ++i) {
    const key = Math.trunc(Math.random() * 0x80000000);
    iblt1.insert(key);
    iblt2.insert(key);
  }

  const hash = 0xD46CD268;
  iblt1.insert(hash);
  {
    const { success, positive, negative } = iblt1.diff(iblt2);
    expect(success).toBeTruthy();
    expect(Array.from(positive)).toStrictEqual([hash]);
    expect(negative.size).toBe(0);
  }

  const iblt0 = new IBLT(paramCompat10);
  {
    const { success } = iblt1.diff(iblt0);
    expect(success).toBeFalsy();
  }
  {
    const { success } = iblt0.diff(iblt2);
    expect(success).toBeFalsy();
  }
});
