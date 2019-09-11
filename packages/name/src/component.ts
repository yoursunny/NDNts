import { Tlv } from "@ndn/tlv";
import printf = require("printf");

function checkType(n: number) {
  if (n < Component.TYPE_MIN || n > Component.TYPE_MAX) {
    throw new Error("Component TLV-TYPE out of range");
  }
}

const UNESCAPED = (() => {
  const s = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-._~";
  const m = {};
  for (let i = 0; i < s.length; ++i) {
    m[s.charCodeAt(i)] = true;
  }
  return m;
})();

/**
 * Name component.
 */
export class Component extends Tlv {
  public static readonly TYPE_MIN = 0x01;
  public static readonly TYPE_MAX = 0xFFFF;

  /**
   * Decode name component.
   * @param wire wire encoding.
   */
  constructor(wire?: Uint8Array) {
    super(wire);
    wire && checkType(this.m_type);
  }

  public get type(): number {
    return this.m_type;
  }

  public set type(n: number) {
    checkType(n);
    this.m_type = n;
  }

  public get value(): Uint8Array {
    return this.m_value;
  }

  public set value(v: Uint8Array) {
    this.m_value = v;
  }

  /**
   * Get URI string.
   */
  public toString(): string {
    let hasNonPeriods = false;
    let b = this.m_type == 0x08 ? "" : printf("%d=", this.m_type);
    b = this.m_value.reduce<string>((b, ch) => {
      hasNonPeriods = hasNonPeriods || ch !== 0x2E;
      if (UNESCAPED[ch]) {
        return b + String.fromCharCode(ch);
      }
      return b + printf("%%%02x", ch);
    }, b);
    if (!hasNonPeriods) {
      b += "...";
    }
    return b;
  }
}
