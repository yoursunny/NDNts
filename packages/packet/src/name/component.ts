import { Decoder, Encoder } from "@ndn/tlv";
import { assert, constrain, fromHex, fromUtf8, toHex, toUtf8 } from "@ndn/util";
import bufferCompare from "buffer-compare";

import { TT } from "../an";
import type { NamingConvention } from "./convention";

function assertType(t: number): number {
  return constrain(t, "Component TLV-TYPE", 0x01, 0xFFFF);
}

const CHAR_ENCODE: Record<number, string> = {};
for (let b = 0x00; b <= 0xFF; ++b) {
  const s = String.fromCodePoint(b);
  CHAR_ENCODE[b] = /[\w.~-]/i.test(s) ? s : `%${toHex.TABLE[b]}`;
}
const CODEPOINT_PERCENT = "%".codePointAt(0)!;
const CODEPOINT_PERIOD = ".".codePointAt(0)!;

const encoderHeadroom = 10;
const FROM = Symbol("@ndn/packet#Component.from");

/** Name component or component URI. */
export type ComponentLike = Component | string;

/**
 * Name component.
 *
 * @remarks
 * This type is immutable.
 */
export class Component {
  public static decodeFrom(decoder: Decoder): Component {
    const { tlv } = decoder.read();
    return new Component(tlv);
  }

  /** Parse from URI representation, or return existing Component. */
  public static from(input: ComponentLike): Component {
    if (input instanceof Component) {
      return input;
    }

    let type: number = TT.GenericNameComponent;
    let posValue = 0;
    const posEqual = input.indexOf("=");
    if (posEqual >= 1) {
      try {
        type = assertType(Number.parseInt(input, 10));
        posValue = posEqual + 1;
      } catch {}
    }

    const maxLength = input.length - posValue;
    const encoder = new Encoder(encoderHeadroom + maxLength);
    const value = encoder.prependRoom(maxLength);
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
    return new Component(type, FROM, encoder, length); // eslint-disable-line etc/no-internal
  }

  /**
   * Construct from TLV-TYPE and TLV-VALUE.
   * @param type - TLV-TYPE. Default is GenericNameComponent.
   * @param value - TLV-VALUE. If specified as string, it's encoded as UTF-8 but not interpreted
   *                as URI. Use `Component.from()` to interpret URI.
   *
   * @throws Error
   * Thrown if `type` is not a valid name component TLV-TYPE.
   */
  constructor(type?: number, value?: Uint8Array | string);

  /**
   * Decode from TLV.
   *
   * @throws Error
   * Thrown if `tlv` does not contain a complete name component TLV and nothing else.
   */
  constructor(tlv: Uint8Array);

  /** @internal */
  constructor(type: number, isFrom: typeof FROM, encoder: Encoder, length: number);

  constructor(
      arg1: number | Uint8Array = TT.GenericNameComponent,
      value?: Uint8Array | string | typeof FROM,
      encoder?: Encoder, length?: number,
  ) {
    if (arg1 instanceof Uint8Array) {
      this.tlv = arg1;
      const decoder = new Decoder(arg1);
      ({ type: this.type, value: this.value } = decoder.read());
      decoder.throwUnlessEof();
    } else {
      this.type = arg1;
      let tailroom = 0;
      if (value === FROM) {
        tailroom = encoder!.size - length!;
      } else {
        if (typeof value === "string") {
          value = toUtf8(value);
        }
        length = value?.length ?? 0;
        encoder = new Encoder(encoderHeadroom + length);
        encoder.encode(value);
      }
      encoder!.prependTypeLength(this.type, length!);
      this.tlv = encoder!.output;
      if (tailroom !== 0) {
        this.tlv = this.tlv.subarray(0, -tailroom);
      }
      this.value = this.tlv.subarray(this.tlv.length - length!);
    }
    assertType(this.type);
  }

  /** Whole TLV. */
  public readonly tlv: Uint8Array;
  /** TLV-TYPE. */
  public readonly type: number;
  /** TLV-VALUE. */
  public readonly value: Uint8Array;

  /** TLV-LENGTH. */
  public get length(): number {
    return this.value.length;
  }

  /** TLV-VALUE interpreted as UTF-8 string. */
  public get text(): string {
    return fromUtf8(this.value);
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
    assert(convention.match(this), "component does not follow convention");
    return convention.parse(this);
  }

  /** Compare this component with other. */
  public compare(other: ComponentLike): Component.CompareResult {
    other = Component.from(other);
    return 2 * Math.sign(this.type - other.type || this.length - other.length ||
      bufferCompare<Uint8Array>(this.value, other.value));
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
}
