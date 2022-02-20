import "../test-fixture/expect";

import { asDataView, asUint8Array } from "..";

test.each([
  [asUint8Array, Uint8Array],
  [asDataView, DataView],
])("asArrayBufferView", (converter, ctor) => {
  const ab = new ArrayBuffer(17);
  const u8 = new Uint8Array(ab, 4, 11);
  const dv = new DataView(ab, 3, 8);

  {
    const r = converter(ab);
    expect(r).toBeInstanceOf(ctor);
    expect(r.buffer).toBe(ab);
    expect(r.byteOffset).toBe(0);
    expect(r.byteLength).toBe(17);
  }

  {
    const r = converter(u8);
    expect(r).toBeInstanceOf(ctor);
    expect(r.buffer).toBe(ab);
    expect(r.byteOffset).toBe(4);
    expect(r.byteLength).toBe(11);
  }

  {
    const r = converter(dv);
    expect(r).toBeInstanceOf(ctor);
    expect(r.buffer).toBe(ab);
    expect(r.byteOffset).toBe(3);
    expect(r.byteLength).toBe(8);
  }
});
