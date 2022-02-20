/** Convert ArrayBuffer or ArrayBufferView to Uint8Array. */
export function asUint8Array(a: BufferSource): Uint8Array {
  if (a instanceof Uint8Array) {
    return a;
  }
  if (a instanceof ArrayBuffer) {
    return new Uint8Array(a);
  }
  return new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
}

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
