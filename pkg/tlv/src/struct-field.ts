import { toHex, toUtf8 } from "@ndn/util";
import type { Constructor } from "type-fest";

import { type Decodable, Decoder } from "./decoder";
import { type Encodable, Encoder } from "./encoder";
import { NNI } from "./nni";

/**
 * StructBuilder field type.
 * @typeParam T - Value type.
 */
export interface StructFieldType<T> {
  /**
   * Create a new value of type T.
   *
   * @remarks
   * Invoked by the TLV class constructor on each non-repeatable required field.
   */
  newValue: (this: void) => T;

  /**
   * Encode a value to sub-TLV element.
   * @returns TLV-VALUE, or `Encoder.OmitEmpty` to omit the field.
   *
   * @remarks
   * Invoked by TLV class `.encodeTo` method.
   * If the field is optional and unset, this is not invoked.
   * If the field is repeatable, this is invoked once per element.
   */
  encode: (this: void, value: T) => Encodable | typeof Encoder.OmitEmpty;

  /**
   * Decode a value from sub-TLV element.
   *
   * @remarks
   * Invoked by TLV class `.decodeFrom` method.
   * If the field is repeatable, this is invoked once per sub-TLV element.
   */
  decode: (this: void, tlv: Decoder.Tlv) => T;

  /**
   * Print a value as string representation.
   * @defaultValue
   * ```ts
   * `${value}`
   * ```
   *
   * @remarks
   * Invoked by TLV class `.toString` method.
   * If the field is optional and unset, this is not invoked.
   * If the field is repeatable, this is invoked once per element.
   */
  asString?: (this: void, value: T) => string;
}
export namespace StructFieldType {
  /**
   * Turn a TLV class into a field type, where the TLV directly appears as the field.
   *
   * @example
   * Given this structure:
   * ```abnf
   * Outer = OUTER-TYPE TLV-LENGTH Inner
   * Inner = INNER-TYPE TLV-LENGTH INNER-VALUE
   * ```
   *
   * You can define the `Outer` builder:
   * ```ts
   * const buildOuter = new StructBuilder("Outer", TT.Outer)
   *   .add(TT.Inner, "inner", StructFieldType.wrap(Inner));
   * ```
   *
   * `Inner` type must encode itself as a TLV, and its TLV-TYPE must equal field TLV-TYPE.
   */
  export function wrap<T extends NonNullable<Encodable>>(
      F: Constructor<T, []> & Decodable<T>,
      overrides: Partial<StructFieldType<T>> = {},
  ): StructFieldType<T> {
    return {
      newValue: () => new F(),
      encode: (value) => {
        const d = new Decoder(Encoder.encode(value));
        return d.read().value;
      },
      decode: ({ decoder }) => decoder.decode(F),
      asString: (value) => value.toString(),
      ...overrides,
    };
  }

  /**
   * Turn a TLV class into a field type, where the TLV is nested inside the field.
   *
   * @example
   * Given this structure:
   * ```abnf
   * Outer = OUTER-TYPE TLV-LENGTH Middle
   * Middle = MIDDLE-TYPE TLV-LENGTH Inner
   * Inner = INNER-TYPE TLV-LENGTH INNER-VALUE
   * ```
   *
   * You can define the `Outer` builder:
   * ```ts
   * const buildOuter = new StructBuilder("Outer", TT.Outer)
   *   .add(TT.Middle, "inner", StructFieldType.nest(Inner));
   * ```
   *
   * `Inner` type does not have to encode itself as a TLV. Its encoding result appears as
   * the TLV-VALUE of the "middle" field TLV.
   */
  export function nest<T extends NonNullable<Encodable>>(
      F: Constructor<T, []> & Decodable<T>,
      overrides: Partial<StructFieldType<T>> = {},
  ): StructFieldType<T> {
    return {
      newValue: () => new F(),
      encode: (value) => value,
      decode: ({ vd }) => vd.decode(F),
      asString: (value) => value.toString(),
      ...overrides,
    };
  }
}

export const StructFieldBool: StructFieldType<boolean> = {
  newValue: () => false,
  encode: (value) => value ? new Uint8Array(0) : Encoder.OmitEmpty,
  decode: () => true,
};

/**
 * StructBuilder field type of non-negative integer.
 *
 * @remarks
 * The field is defined as number.
 * If the field is required, it is initialized as zero.
 */
export const StructFieldNNI: StructFieldType<number> = {
  newValue: () => 0,
  encode: NNI,
  decode: ({ nni }) => nni,
};

/**
 * StructBuilder field type of non-negative integer.
 *
 * @remarks
 * The field is defined as bigint.
 * If the field is required, it is initialized as zero.
 */
export const StructFieldNNIBig: StructFieldType<bigint> = {
  newValue: () => 0n,
  encode: NNI,
  decode: ({ nniBig }) => nniBig,
};

/**
 * Declare a StructBuilder field type of non-negative integer from an enum.
 * @param Enum - A flat (not OR'ed flags) enum type.
 *
 * @remarks
 * The field is defined as a flat enum type.
 * If the field is required, it is initialized as zero.
 */
export function StructFieldEnum<E extends number>(Enum: Record<number, string>): StructFieldType<E> {
  return {
    ...(StructFieldNNI as any),
    asString: (value) => `${value}(${Enum[value] ?? "unknown"})`,
  };
}

/**
 * StructBuilder field type of UTF-8 text.
 *
 * @remarks
 * The field is defined as string.
 * If the field is required, it is initialized as an empty string.
 */
export const StructFieldText: StructFieldType<string> = {
  newValue: () => "",
  encode: toUtf8,
  decode: ({ text }) => text,
  asString: (value) => JSON.stringify(value),
};

/**
 * StructBuilder field type of raw bytes.
 *
 * @remarks
 * The field is defined as Uint8Array.
 * If the field is required, it is initialized as an empty Uint8Array.
 */
export const StructFieldBytes: StructFieldType<Uint8Array> = {
  newValue: () => new Uint8Array(),
  encode: (value) => value,
  decode: ({ value }) => value,
  asString: (value) => toHex(value),
};
