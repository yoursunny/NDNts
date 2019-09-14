import { Decoder, Tlv } from "@ndn/tlv";
import { TT } from "@ndn/tt-base";
import printf = require("printf");

import { NamingConventionBase } from "./convention";

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

export type ComponentLike = Component | string;

/**
 * Component compare result.
 */
export enum ComponentCompareResult {
  /** lhs is less than rhs */
  LT = -2,
  /** lhs and rhs are equal */
  EQUAL = 0,
  /** lhs is greater than rhs */
  GT = 2,
}

/**
 * Name component.
 * This type is immutable.
 */
export class Component extends Tlv {
  public static decodeFrom(decoder: Decoder): Component {
    const comp = Tlv.decodeFromImpl(decoder, new Component());
    checkType(comp.type_);
    return comp;
  }

  /**
   * Return Component instance, or parse from URI representation.
   * @todo handle ImplicitSha256DigestComponent and ParametersSha256DigestComponent.
   */
  public static from(input: ComponentLike): Component {
    if (input instanceof Component) {
      return input;
    }
    const s = input as string;
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
    const value = new Uint8Array(sValue.length);
    let length = 0;
    for (let i = 0; i < sValue.length;) {
      let ch = sValue.charCodeAt(i);
      if (ch === 0x25) { // '%'
        ch = parseInt(sValue.substr(i + 1, 2), 16);
        i += 3;
      } else {
        ++i;
      }
      value[length++] = ch;
    }
    return new Component(type, value.subarray(0, length));
  }

  /**
   * Create empty GenericNameComponent.
   */
  constructor();

  /**
   * Create name component with TLV-TYPE and TLV-VALUE.
   */
  constructor(type: number, value?: Uint8Array);

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

  /**
   * Determine if component follows a naming convention.
   */
  public is(convention: NamingConventionBase): boolean {
    return convention.match(this);
  }

  /**
   * Compare with other component.
   */
  public compare(other: ComponentLike): ComponentCompareResult {
    const rhs = Component.from(other);
    if (this.type < rhs.type) {
      return ComponentCompareResult.LT;
    }
    if (this.type > rhs.type) {
      return ComponentCompareResult.GT;
    }
    if (this.length < rhs.length) {
      return ComponentCompareResult.LT;
    }
    if (this.length > rhs.length) {
      return ComponentCompareResult.GT;
    }
    const cmp = Buffer.compare(this.value, rhs.value);
    if (cmp < 0) {
      return ComponentCompareResult.LT;
    }
    if (cmp > 0) {
      return ComponentCompareResult.GT;
    }
    return ComponentCompareResult.EQUAL;
  }

  /**
   * Determine if this name component equals other.
   */
  public equals(other: ComponentLike): boolean {
    return this.compare(other) === ComponentCompareResult.EQUAL;
  }
}
