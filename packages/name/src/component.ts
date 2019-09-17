import { Decoder, Encoder } from "@ndn/tlv";
import { TT } from "@ndn/tt-base";
import printf from "printf";

import { NamingConventionBase } from "./convention";

function checkType(n: number) {
  if (n < 0x01 || n > 0xFFFF) {
    throw new Error("Component TLV-TYPE out of range");
  }
}

const UNESCAPED = (() => {
  const s = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
  const m = {};
  for (let i = 0; i < s.length; ++i) {
    m[s.charCodeAt(i)] = true;
  }
  return m;
})();

export type ComponentLike = Component | string;

/**
 * Name component.
 * This type is immutable.
 */
export class Component {
  public get type(): number {
    return this.type_;
  }

  public get length(): number {
    return this.value_.length;
  }

  public get value(): Uint8Array {
    return this.value_;
  }

  /** TLV-VALUE interpreted as UTF-8 string. */
  public get text(): string {
    return new TextDecoder().decode(this.value_);
  }

  public static decodeFrom(decoder: Decoder): Component {
    const { type, value } = decoder.read();
    return new Component(type, value);
  }

  /** Parse from URI representation, or return existing Component. */
  public static from(input: ComponentLike): Component {
    // TODO handle ImplicitSha256DigestComponent and ParametersSha256DigestComponent
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

  private type_: number;
  private value_: Uint8Array;

  /**
   * Construct name component.
   * @param type TLV-TYPE.
   * @param value TLV-VALUE; if specified as string, it's encoded as UTF-8 but not interpreted
   *              as URI representation. Use from() to interpret URI.
   */
  constructor(type: number = TT.GenericNameComponent, value?: Uint8Array|string) {
    checkType(type);
    this.type_ = type;
    if (value instanceof Uint8Array) {
      this.value_ = value;
    } else if (typeof value === "string") {
      this.value_ = new TextEncoder().encode(value);
    } else {
      this.value_ = new Uint8Array();
    }
  }

  /** Get URI string. */
  public toString(): string {
    // TODO handle ImplicitSha256DigestComponent and ParametersSha256DigestComponent
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

  public encodeTo(encoder: Encoder) {
    encoder.prependTlv(this.type_, this.value_);
  }

  /** Determine if component follows a naming convention. */
  public is(convention: NamingConventionBase): boolean {
    return convention.match(this);
  }

  /** Compare this component with other. */
  public compare(other: ComponentLike): Component.CompareResult {
    return Component.compare(this, other);
  }

  /** Determine if this component equals other. */
  public equals(other: ComponentLike): boolean {
    return this.compare(other) === Component.CompareResult.EQUAL;
  }
}

export namespace Component {
  /** Component compare result. */
  export enum CompareResult {
    /** lhs is less than rhs */
    LT = -2,
    /** lhs and rhs are equal */
    EQUAL = 0,
    /** lhs is greater than rhs */
    GT = 2,
  }

  function toCompareResult(diff: number): CompareResult {
    return diff === 0 ? CompareResult.EQUAL :
           diff < 0 ? CompareResult.LT : CompareResult.GT;
  }

  /** Compare two components. */
  export function compare(lhs: ComponentLike, rhs: ComponentLike): CompareResult {
    const l = Component.from(lhs);
    const r = Component.from(rhs);
    return toCompareResult(l.type - r.type) ||
           toCompareResult(l.length - r.length) ||
           toCompareResult(Buffer.compare(l.value, r.value));
  }
}
