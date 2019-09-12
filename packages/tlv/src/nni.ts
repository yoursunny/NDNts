export const NNI = {
  encode: (n: number): Uint8Array => {
    let b;
    if (n <= 0xFF) {
      b = new Uint8Array([n]);
    } else if (n <= 0xFFFF) {
      b = new Uint8Array(2);
      new DataView(b.buffer).setUint16(0, n, false);
    } else if (n <= 0xFFFFFFFF) {
      b = new Uint8Array(4);
      new DataView(b.buffer).setUint32(0, n, false);
    } else if (n <= Number.MAX_SAFE_INTEGER) {
      b = new Uint8Array(8);
      const dv = new DataView(b.buffer);
      dv.setUint32(0, n / 0x100000000, false);
      dv.setUint32(4, n % 0x100000000, false);
    } else {
      throw new Error("number is too large");
    }
    return b;
  },

  decode: (b: Uint8Array): number => {
    const dv = new DataView(b.buffer);
    switch (b.length) {
      case 1:
        return dv.getUint8(0);
      case 2:
        return dv.getUint16(0, false);
      case 4:
        return dv.getUint32(0, false);
      case 8:
        const n = dv.getUint32(0, false) * 0x100000000 + dv.getUint32(4, false);
        if (n > Number.MAX_SAFE_INTEGER) {
          throw new Error("number is too large");
        }
        return n;
    }
    throw new Error("invalid TLV-LENGTH");
  },
};
