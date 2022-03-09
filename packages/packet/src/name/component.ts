import { Decoder, Encoder } from "@ndn/tlv";
import { fromHex, fromUtf8, toHex, toUtf8 } from "@ndn/util";
import bufferCompare from "buffer-compare";

import { TT } from "../an";
import type { NamingConvention } from "./convention";

function checkType(t: number): boolean {
  return Number.isFinite(t) && t >= 0x01 && t <= 0xFFFF;
}

function assertType(t: number): void {
  if (!checkType(t)) {
    throw new Error(`Component TLV-TYPE ${t} out of range`);
  }
}

const CHAR_ENCODE: Record<number, string> = {};
for (let b = 0x00; b <= 0xFF; ++b) {
  const s = String.fromCodePoint(b);
  CHAR_ENCODE[b] = /[\w.~-]/i.test(s) ? s : `%${toHex.TABLE[b]}`;
}
const CODEPOINT_PERCENT = "%".codePointAt(0);
const CODEPOINT_PERIOD = ".".codePointAt(0);

/** Name component or component URI. */
export type ComponentLike = Component | string;

/**
 * Name component.
 * This type is immutable.
 */
export class Component {
  /** TLV-LENGTH. */
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

    let type = TT.GenericNameComponent;
    let posValue = 0;
    const posEqual = input.indexOf("=");
    if (posEqual >= 1) {
      const iType = Number.parseInt(input, 10);
      if (checkType(iType)) {
        type = iType;
        posValue = posEqual + 1;
      }
    }

    const value = new Uint8Array(input.length - posValue);
    let length = 0;
    let hasNonPeriods = false;
    for (let i = posValue; i < input.length;) {
      let b = input.codePointAt(i)!;
      hasNonPeriods ||= b !== CODEPOINT_PERIOD;
      if (b === CODEPOINT_PERCENT) {
        b = (fromHex.TABLE[input[i + 1]!]! << 4) | fromHex.TABLE[input[i + 2]!]!;
        i += 3;
      } else {
        ++i;
      }
      value[length++] = b;
    }
    if (!hasNonPeriods && length >= 3) {
      length -= 3;
    }
    return new Component(type, value.subarray(0, length));
  }

  /** Whole TLV. */
  public readonly tlv: Uint8Array;
  /** TLV-TYPE. */
  public readonly type: number;
  /** TLV-VALUE. */
  public readonly value: Uint8Array;

  /**
   * Construct from TLV-TYPE and TLV-VALUE.
   * @param type TLV-TYPE, default is GenericNameComponent.
   * @param value TLV-VALUE; if specified as string, it's encoded as UTF-8 but not interpreted
   *              as URI representation. Use from() to interpret URI.
   */
  constructor(type?: number, value?: Uint8Array | string);

  /** Construct from TLV. */
  constructor(tlv: Uint8Array);

  constructor(
      arg1: number | Uint8Array = TT.GenericNameComponent,
      value: Uint8Array | string = new Uint8Array(),
  ) {
    if (arg1 instanceof Uint8Array) {
      this.tlv = arg1;
      const decoder = new Decoder(arg1);
      ({ type: this.type, value: this.value } = decoder.read());
      assertType(this.type);
      return;
    }

    this.type = arg1;
    assertType(this.type);
    this.value = typeof value === "string" ? toUtf8(value) : value;
    this.tlv = Encoder.encode([this.type, this.value], 10 + this.value.length);
  }

  /** Get URI string. */
  public toString(): string {
    let s = `${this.type}=`;
    let hasNonPeriods = false;
    for (const b of this.value) {
      hasNonPeriods ||= b !== CODEPOINT_PERIOD;
      s += CHAR_ENCODE[b]!;
    }
    if (!hasNonPeriods) {
      s += "...";
    }
    return s;
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
