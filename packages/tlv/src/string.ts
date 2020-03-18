/** Pretty-print TLV-TYPE number. */
export function printTT(tlvType: number): string {
  const s = tlvType.toString(16).toUpperCase();
  if (tlvType < 0xFD) {
    return `0x${s.padStart(2, "0")}`;
  }
  if (tlvType <= 0xFFFF) {
    return `0x${s.padStart(4, "0")}`;
  }
  return `0x${s.padStart(8, "0")}`;
}

let hexTable: string[]|undefined;

function getHexTable(): string[] {
  if (!hexTable) {
    hexTable = new Array<string>(0x100);
    for (let b = 0; b <= 0xFF; ++b) {
      hexTable[b] = b.toString(16).padStart(2, "0").toUpperCase();
    }
  }
  return hexTable;
}

/** Convert byte array to upper-case hexadecimal string. */
export function toHex(buf: Uint8Array): string {
  const table = getHexTable();
  const a = new Array<string>(buf.length);
  for (const [i, element] of buf.entries()) {
    a[i] = table[element];
  }
  return a.join("");
}

/**
 * Convert hexadecimal string to byte array.
 *
 * This function lacks error handling. Use on trusted input only.
 */
export function fromHex(s: string): Uint8Array {
  const b = new Uint8Array(s.length / 2);
  for (let i = 0; i < b.length; ++i) {
    b[i] = parseInt(s.slice(i * 2, (i + 1) * 2), 16);
  }
  return b;
}
