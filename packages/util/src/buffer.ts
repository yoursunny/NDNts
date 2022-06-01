function asArrayBufferView<T extends ArrayBufferView>(
    T: new(ab: ArrayBuffer, offset?: number, length?: number) => T,
    a: BufferSource,
): T {
  if (a instanceof T) {
    return a;
  }
  if (a instanceof ArrayBuffer) {
    return new T(a);
  }
  return new T(a.buffer, a.byteOffset, a.byteLength);
}

/** Convert ArrayBuffer or ArrayBufferView to Uint8Array. */
export function asUint8Array(a: BufferSource): Uint8Array {
  return asArrayBufferView(Uint8Array, a);
}

/** Convert ArrayBuffer or ArrayBufferView to DataView. */
export function asDataView(a: BufferSource): DataView {
  return asArrayBufferView(DataView, a);
}
