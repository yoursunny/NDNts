import "../test-fixture/expect";

import { expect, test } from "vitest";

import { asDataView } from "..";

test("asDataView", () => {
  const ab = new ArrayBuffer(17);
  const u8 = new Uint8Array(ab, 4, 11);
  const dv = new DataView(ab, 3, 8);

  {
    const r = asDataView(ab);
    expect(r).toBeInstanceOf(DataView);
    expect(r.buffer).toBe(ab);
    expect(r.byteOffset).toBe(0);
    expect(r.byteLength).toBe(17);
  }

  {
    const r = asDataView(u8);
    expect(r).toBeInstanceOf(DataView);
    expect(r.buffer).toBe(ab);
    expect(r.byteOffset).toBe(4);
    expect(r.byteLength).toBe(11);
  }

  {
    const r = asDataView(dv);
    expect(r).toBeInstanceOf(DataView);
    expect(r.buffer).toBe(ab);
    expect(r.byteOffset).toBe(3);
    expect(r.byteLength).toBe(8);
  }
});
