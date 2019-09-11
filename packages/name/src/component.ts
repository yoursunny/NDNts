import { Tlv } from "@ndn/tlv";
import { TT } from "@ndn/tt-base";
import printf = require("printf");

function checkType(n: number) {
  if (n < 0x01 || n > 0xFFFF) {
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
  /**
   * Parse from string.
   * @param s URI representation.
   * @todo handle ImplicitSha256DigestComponent and ParametersSha256DigestComponent.
   */
  public static from(s: string): Component {
    let [sType, sValue] = s.split("=", 2);
    let type = TT.GenericNameComponent;
    if (typeof sValue !== "undefined") {
      type = parseInt(sType, 10);
    } else {
      [sType, sValue] = ["", sType];
    }
    if (/^\.*$/.test(sValue)) {
      sValue = sValue.substr(3);
    }
    const value = new TextEncoder().encode(decodeURIComponent(sValue));
    return new Component(type, new Uint8Array(value));
  }

  /**
   * Create empty GenericNameComponent.
   */
  constructor();

  /**
   * Decode name component.
   * @param wire wire encoding.
   */
  constructor(wire: Uint8Array);

  /**
   * Create name component with TLV-TYPE and TLV-VALUE.
   */
  constructor(type: number, value?: Uint8Array);

  /**
   * Constructor invalid name component, or decode name component.
   * @param wire wire encoding.
   */
  constructor(arg1?, arg2?) {
    if (typeof arg1 === "undefined") {
      super(TT.GenericNameComponent);
    } else {
      super(arg1, arg2);
    }
    checkType(this.type_);
  }

  /**
   * Get URI string.
   * @todo handle ImplicitSha256DigestComponent and ParametersSha256DigestComponent.
   */
  public toString(): string {
    let hasNonPeriods = false;
    let b = this.type_ === TT.GenericNameComponent ? "" : printf("%d=", this.type_);
    b = this.value_.reduce<string>((b, ch) => {
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
