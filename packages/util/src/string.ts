const INT2HEX: string[] = [];
for (let b = 0; b <= 0xFF; ++b) {
  INT2HEX.push(b.toString(16).padStart(2, "0").toUpperCase());
}

const HEX2INT: Record<string, number> = {};
for (let b = 0; b <= 0xF; ++b) {
  const ch = b.toString(16);
  HEX2INT[ch.toLowerCase()] = b;
  HEX2INT[ch.toUpperCase()] = b;
}

/** Convert byte array to upper-case hexadecimal string. */
export function toHex(buf: Uint8Array): string {
  let s = "";
  for (const b of buf) {
    s += INT2HEX[b];
  }
  return s;
}

/**
 * Convert hexadecimal string to byte array.
 *
 * If the input is not a valid hexadecimal string, result will be incorrect.
 */
export function fromHex(s: string): Uint8Array {
  const b = new Uint8Array(s.length / 2);
  for (let i = 0; i < b.length; ++i) {
    b[i] = (HEX2INT[s[i * 2]!]! << 4) | HEX2INT[s[i * 2 + 1]!]!;
  }
  return b;
}

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

/** Convert string to UTF-8 byte array. */
export function toUtf8(s: string): Uint8Array {
  return textEncoder.encode(s);
}

/** Convert UTF-8 byte array to string. */
export function fromUtf8(buf: Uint8Array): string {
  return textDecoder.decode(buf);
}
