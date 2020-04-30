import { Decoder, Encoder, fromUtf8, toUtf8 } from "@ndn/tlv";
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
    return fromUtf8(this.value);
  }

  public static decodeFrom(decoder: Decoder): Component {
    const { tlv } = decoder.read();
    return new Component(tlv);
  }

  /** Parse from URI representation, or return existing Component. */
  public static from(input: ComponentLike): Component {
    if (input instanceof Component) {
      return input;
    }

    let [sType, sValue] = input.split("=", 2);
    let type = TT.GenericNameComponent;
    if (typeof sValue === "undefined") {
      [sType, sValue] = ["", sType];
    } else {
      type = Number.parseInt(sType, 10);
    }
    if (/^\.*$/.test(sValue)) {
      sValue = sValue.slice(3);
    }

    const value = new Uint8Array(sValue.length);
    let length = 0;
    for (let i = 0; i < sValue.length;) {
      let ch = sValue.charCodeAt(i);
      if (ch === CHARCODE_PERCENT) {
        ch = Number.parseInt(sValue.slice(i + 1, i + 3), 16);
        i += 3;
      } else {
        ++i;
      }
      value[length++] = ch;
    }
    return new Component(type, value.subarray(0, length));
  }

  public readonly tlv: Uint8Array;
  public readonly type: number;
  public readonly value: Uint8Array;

  /**
   * Construct from TLV-TYPE and TLV-VALUE.
   * @param type TLV-TYPE, default is GenericNameComponent.
   * @param value TLV-VALUE; if specified as string, it's encoded as UTF-8 but not interpreted
   *              as URI representation. Use from() to interpret URI.
   */
  constructor(type?: number, value?: Uint8Array|string);

  /** Construct from TLV. */
  constructor(tlv: Uint8Array);

  constructor(arg1?: number|Uint8Array, arg2?: Uint8Array|string) {
    switch (typeof arg1) {
      case "object": {
        this.tlv = arg1;
        const decoder = new Decoder(arg1);
        ({ type: this.type, value: this.value } = decoder.read());
        checkType(this.type);
        return;
      }
      case "undefined":
        this.type = TT.GenericNameComponent;
        break;
      case "number":
        this.type = arg1;
        checkType(this.type);
        break;
    }
    switch (typeof arg2) {
      case "undefined":
        this.value = new Uint8Array();
        break;
      case "string":
        this.value = toUtf8(arg2);
        break;
      case "object":
        this.value = arg2;
        break;
    }
    this.tlv = Encoder.encode([this.type, this.value], 10 + this.value.length);
  }

  /** Get URI string. */
  public toString(): string {
    let b = `${this.type}=`;
    let hasNonPeriods = false;
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
    encoder.encode(this.tlv);
  }

  /** Determine if component follows a naming convention. */
  public is(convention: NamingConvention<any>): boolean {
    return convention.match(this);
  }

  /** Convert with naming convention. */
  public as<R>(convention: NamingConvention<any, R>): R {
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
