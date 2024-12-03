function asArrayBufferView<T extends ArrayBufferView>(
    T: new(ab: ArrayBufferLike, offset?: number, length?: number) => T,
    a: ArrayBufferLike | ArrayBufferView,
): T {
  if (a instanceof T) {
    return a;
  }
  if ("buffer" in a) {
    return new T(a.buffer, a.byteOffset, a.byteLength);
  }
  return new T(a);
}

/** Convert (Shared)ArrayBuffer(View) to Uint8Array. */
export function asUint8Array(a: ArrayBufferLike | ArrayBufferView): Uint8Array {
  return asArrayBufferView(Uint8Array, a);
}

/** Convert (Shared)ArrayBuffer(View) to DataView. */
export function asDataView(a: ArrayBufferLike | ArrayBufferView): DataView {
  return asArrayBufferView(DataView, a);
}
