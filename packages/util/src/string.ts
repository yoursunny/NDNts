const INT2HEX: string[] = [];
const HEX2INT: Record<string, number> = {};
for (let b = 0; b <= 0xFF; ++b) {
  const s = b.toString(16).padStart(2, "0").toUpperCase();
  INT2HEX.push(s);
  HEX2INT[s] = b;
}

/** Convert byte array to upper-case hexadecimal string. */
export function toHex(buf: Uint8Array): string {
  return Array.from(buf, (b) => INT2HEX[b]).join("");
}

/**
 * Convert hexadecimal string to byte array.
 *
 * If the input is not a valid hexadecimal string, result will be incorrect.
 */
export function fromHex(s: string): Uint8Array {
  s = s.toUpperCase();
  const b = new Uint8Array(s.length / 2);
  for (let i = 0; i < b.length; ++i) {
    b[i] = HEX2INT[s.slice(i * 2, (i + 1) * 2)]!;
  }
  return b;
}

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export function toUtf8(s: string): Uint8Array {
  return textEncoder.encode(s);
}

export function fromUtf8(buf: Uint8Array): string {
  return textDecoder.decode(buf);
}
