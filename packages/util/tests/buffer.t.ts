import { expect, test } from "vitest";

import { asDataView, asUint8Array } from "..";

test.each([
  { title: "asUint8Array", T: Uint8Array, f: asUint8Array },
  { title: "asDataView", T: DataView, f: asDataView },
])("asArrayBufferView %j", ({ T, f }) => {
  const ab = new ArrayBuffer(17);
  const u8 = new Uint8Array(ab, 4, 11);
  const dv = new DataView(ab, 3, 8);

  {
    const r = f(ab);
    expect(r).toBeInstanceOf(T);
    expect(r.buffer).toBe(ab);
    expect(r.byteOffset).toBe(0);
    expect(r.byteLength).toBe(17);
  }

  {
    const r = f(u8);
    expect(r).toBeInstanceOf(T);
    expect(r.buffer).toBe(ab);
    expect(r.byteOffset).toBe(4);
    expect(r.byteLength).toBe(11);
  }

  {
    const r = f(dv);
    expect(r).toBeInstanceOf(T);
    expect(r.buffer).toBe(ab);
    expect(r.byteOffset).toBe(3);
    expect(r.byteLength).toBe(8);
  }
});
