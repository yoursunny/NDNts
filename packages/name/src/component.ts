import { Decoder, Encoder } from "@ndn/tlv";
import bufferCompare from "buffer-compare";

import { TT } from "./an";
import { NamingConvention } from "./convention";

function checkType(n: number) {
  if (n < 0x01 || n > 0xFFFF) {
    throw new Error("Component TLV-TYPE out of range");
  }
}

const CHAR_ENCODE = (() => {
  const UNESCAPED = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
  const a = new Array<string>(256);
  for (let ch = 0x00; ch <= 0xFF; ++ch) {
    const s = String.fromCharCode(ch);
    a[ch] = UNESCAPED.includes(s) ? s : `%${ch.toString(16).padStart(2, "0").toUpperCase()}`;
  }
  return a;
})();
const CHARCODE_PERCENT = "%".charCodeAt(0);
const CHARCODE_PERIOD = ".".charCodeAt(0);

export type ComponentLike = Component | string;

/**
 * Name component.
 * This type is immutable.
 */
export class Component {
  public get length(): number {
    return this.value.length;
  }

  /** TLV-VALUE interpreted as UTF-8 string. */
  public get text(): string {
    return new TextDecoder().decode(this.value);
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
      if (ch === CHARCODE_PERCENT) {
        ch = parseInt(sValue.substr(i + 1, 2), 16);
        i += 3;
      } else {
        ++i;
      }
      value[length++] = ch;
    }
    return new Component(type, value.subarray(0, length));
  }

  public readonly value: Uint8Array;

  /**
   * Construct name component.
   * @param type TLV-TYPE.
   * @param value TLV-VALUE; if specified as string, it's encoded as UTF-8 but not interpreted
   *              as URI representation. Use from() to interpret URI.
   */
  constructor(public readonly type: number = TT.GenericNameComponent, value?: Uint8Array|string) {
    checkType(type);
    if (value instanceof Uint8Array) {
      this.value = value;
    } else if (typeof value === "string") {
      this.value = new TextEncoder().encode(value);
    } else {
      this.value = new Uint8Array();
    }
  }

  /** Get URI string. */
  public toString(): string {
    // TODO handle ImplicitSha256DigestComponent and ParametersSha256DigestComponent
    let hasNonPeriods = false;
    let b = "";
    if (this.type !== TT.GenericNameComponent) {
      b = `${this.type}=`;
    }
    this.value.forEach((ch) => {
      hasNonPeriods = hasNonPeriods || ch !== CHARCODE_PERIOD;
      b += CHAR_ENCODE[ch];
    });
    if (!hasNonPeriods) {
      b += "...";
    }
    return b;
  }

  public encodeTo(encoder: Encoder) {
    encoder.prependTlv(this.type, this.value);
  }

  /** Determine if component follows a naming convention. */
  public is(convention: NamingConvention<unknown, unknown>): boolean {
    return convention.match(this);
  }

  /** Convert with naming convention. */
  public as<R>(convention: NamingConvention<unknown, R>): R {
    if (!this.is(convention)) {
      throw new Error("component does not follow convention");
    }
    return convention.parse(this);
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
           toCompareResult(bufferCompare<Uint8Array>(l.value, r.value));
  }
}
