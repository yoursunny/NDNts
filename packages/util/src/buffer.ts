/** Convert ArrayBuffer or ArrayBufferView to DataView. */
export function asDataView(a: BufferSource): DataView {
  if (a instanceof DataView) {
    return a;
  }
  if (a instanceof ArrayBuffer) {
    return new DataView(a);
  }
  return new DataView(a.buffer, a.byteOffset, a.byteLength);
}
