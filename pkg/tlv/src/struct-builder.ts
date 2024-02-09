import { assert, toHex, toUtf8 } from "@ndn/util";
import type { Constructor, IfNever, Simplify } from "type-fest";

import { type Decodable, Decoder } from "./decoder";
import { type Encodable, type EncodableObj, Encoder } from "./encoder";
import { EvDecoder } from "./ev-decoder";
import { NNI } from "./nni";

/**
 * StructBuilder field type.
 * @typeParam T - Value type.
 */
export interface StructFieldType<T> {
  newValue: (this: void) => T;
  encode: (this: void, value: T) => Encodable;
  decode: (this: void, tlv: Decoder.Tlv) => T;
  asString?: (this: void, value: T) => string;
}
export namespace StructFieldType {
  export function wrap<T extends EncodableObj>(F: Constructor<T> & Decodable<T>, overrides: Partial<StructFieldType<T>> = {}): StructFieldType<T> {
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

  export function nest<T extends EncodableObj>(F: Constructor<T> & Decodable<T>, overrides: Partial<StructFieldType<T>> = {}): StructFieldType<T> {
    return {
      newValue: () => new F(),
      encode: (value) => value,
      decode: ({ vd }) => vd.decode(F),
      asString: (value) => value.toString(),
      ...overrides,
    };
  }
}

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
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
  return {
    ...(StructFieldNNI as any),
    asString: (value) => `${value}(${Enum[value] ?? "unknown"})`,
  } as StructFieldType<E>;
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

/** StructBuilder field options. */
interface Options<
  Required extends boolean,
  Repeat extends boolean,
  FlagPrefix extends string,
  FlagBit extends string,
> extends EvDecoder.RuleOptions {
  /**
   * Whether the field is required.
   * If both `.required` and `.repeat` are false, the field may be set to undefined and is initialized as undefined.
   * @defaultValue `false`
   */
  required?: Required;

  /**
   * Whether the field is repeated.
   * If `.repeat` is true, the field is defined as an array and is initialized as an empty array.
   * @defaultValue `false`
   */
  repeat?: Repeat;

  /**
   * Prefix of bit property names.
   * Ignored if `.flagBits` is unspecified.
   *
   * @defaultValue
   * Same as primary field name.
   */
  flagPrefix?: FlagPrefix;

  /**
   * Mapping from bit name to bit value.
   * If specified, the field is treated as bit flags.
   */
  flagBits?: Record<FlagBit, number>;
}

interface Field<T> extends Required<EvDecoder.RuleOptions> {
  readonly tt: number;
  readonly key: string;
  newValue: () => T;
  encode: (v: T) => Iterable<Encodable>;
  asString: (v: T) => Iterable<string>;
}

interface FlagBitDesc {
  readonly key: string;
  readonly prop: string;
  readonly bit: number;
}

type ErrFlags = "ERROR: can only define flags on a non-repeatable number field";

type ValidateOptions<T, Repeat extends boolean, FlagBit extends string, R> =
  IfNever<FlagBit, R, Repeat extends true ? ErrFlags : T extends number ? R : ErrFlags>;

type AddField<K extends string, T, Required extends boolean, Repeat extends boolean> =
  Repeat extends true ? { [key in K]: T[]; } :
  Required extends true ? { [key in K]: T; } :
  { [key in K]?: T; };

type AddFlags<FlagPrefix extends string, FlagBit extends string> =
  { [key in `${FlagPrefix}${Capitalize<FlagBit>}`]: boolean; };

/**
 * Helper to build a base class that represents a TLV structure.
 *
 * @remarks
 * StructBuilder allows you to define the typing, constructor, encoder, and decoder, while writing
 * each field only once. It is only compatible with a subset of TLV structures. Namely, the TLV
 * structure shall contain a sequence of sub-TLV elements with distinct TLV-TYPE numbers, where
 * each sub-TLV-TYPE may appear zero, one, or multiple times.
 *
 * To use StructBuilder, calling code should follow these steps:
 * 1. Invoke `.add()` method successively to define sub-TLV elements.
 * 2. Obtain a base class via `.baseClass()` method, would contain one field for each sub-TLV-TYPE
 *    as defined, along with constructor, encoding, and decoding functions.
 * 3. Declare a subclass deriving from this base class, to add more functionality.
 * 4. Assign the subclass constructor to `.subclass` property of the builder.
 */
export class StructBuilder<U extends {}> {
  /**
   * Constructor.
   * @param typeName - Type name, used in error messages.
   * @param topTT - If specified, encode as complete TLV; otherwise, encode as TLV-VALUE only.
   */
  constructor(public readonly typeName: string, public readonly topTT?: number) {
    this.EVD = new EvDecoder<any>(typeName, topTT);
  }

  /**
   * Subclass constructor.
   * This must be assigned, otherwise decoding function will not work.
   */
  public subclass?: Constructor<U, []>;
  private readonly fields: Array<Field<any>> = [];
  private readonly flagBits: FlagBitDesc[] = [];
  private readonly EVD: EvDecoder<any>;

  /** Return field names. */
  public get keys(): string[] {
    return this.fields.map(({ key }) => key);
  }

  /**
   * Add a field.
   * @param tt - TLV-TYPE number.
   * @param key - Field name on the base class.
   * @param type - Field type.
   * @param opts - Field options.
   * @returns StructBuilder annotated with field typing.
   */
  public add<
    T,
    K extends string,
    Required extends boolean = false,
    Repeat extends boolean = false,
    FlagPrefix extends string = K,
    FlagBit extends string = never,
  >(
      tt: number,
      key: ValidateOptions<T, Repeat, FlagBit, K>,
      type: StructFieldType<T>,
      opts: Options<Required, Repeat, FlagPrefix, FlagBit> = {},
  ): StructBuilder<Simplify<U & AddField<K, T, Required, Repeat> & AddFlags<FlagPrefix, FlagBit>>> {
    const fo = { flagPrefix: key, ...opts, ...this.EVD.applyDefaultsToRuleOptions(opts) };
    const { asString: itemAsString = (value) => `${value}` } = type;

    if (fo.repeat) {
      this.fields.push({
        ...fo,
        tt,
        key,
        newValue: () => [],
        *encode(vec) {
          for (const item of vec) {
            yield type.encode(item);
          }
        },
        *asString(vec) {
          if (vec.length === 0) {
            return;
          }
          let delim = ` ${key}=[`;
          for (const item of vec) {
            yield `${delim}${itemAsString(item)}`;
            delim = ", ";
          }
          yield "]";
        },
      } satisfies Field<T[]>);
    } else {
      this.fields.push({
        ...fo,
        tt,
        key,
        newValue: fo.required ? type.newValue : () => undefined,
        *encode(v) {
          if (v !== undefined) {
            yield type.encode(v);
          }
        },
        asString: fo.flagBits ? function*(v) {
          if (typeof v !== "number") {
            return;
          }
          yield ` ${key}=0x${v.toString(16).toUpperCase()}(`;
          let delim = "";
          for (const [str, bit] of Object.entries<number>(fo.flagBits!)) {
            if ((v & bit) !== 0) {
              yield `${delim}${str}`;
              delim = "|";
            }
          }
          yield ")";
        } : function*(v) {
          if (v !== undefined) {
            yield ` ${key}=${itemAsString(v)}`;
          }
        },
      } satisfies Field<T | undefined>);
    }

    this.EVD.add(
      tt,
      fo.repeat ?
        (t, tlv) => t[key].push(type.decode(tlv)) :
        (t, tlv) => t[key] = type.decode(tlv),
      fo,
    );

    if (fo.flagBits) {
      for (const [str, bit] of Object.entries<number>(fo.flagBits)) {
        const prop = fo.flagPrefix + str.slice(0, 1).toUpperCase() + str.slice(1);
        this.flagBits.push({ key, prop, bit });
      }
    }

    return this as any;
  }

  /** Change IsCritical on the EvDecoder. */
  public setIsCritical(cb: EvDecoder.IsCritical): this {
    this.EVD.setIsCritical(cb);
    return this;
  }

  /**
   * Obtain a base class for the TLV structure class.
   * @typeParam S - Subclass type.
   */
  public baseClass<S>(): (new() => Simplify<U> & EncodableObj) & Decodable<S> {
    this.fields.sort(({ order: a }, { order: b }) => a - b);
    const b = this; // eslint-disable-line unicorn/no-this-assignment, @typescript-eslint/no-this-alias
    return class {
      constructor() {
        for (const { key, newValue: construct } of b.fields) {
          (this as any)[key] = construct();
        }

        for (const { key, prop, bit } of b.flagBits) {
          Object.defineProperty(this, prop, {
            configurable: true,
            enumerable: false,
            get(): boolean {
              return (((this)[key] ?? 0) & bit) !== 0;
            },
            set(v: boolean) {
              (this)[key] ??= 0;
              if (v) {
                (this)[key] |= bit;
              } else {
                (this)[key] &= ~bit;
              }
            },
          });
        }
      }

      public encodeTo(encoder: Encoder): void {
        const elements: Encodable[] = [];
        for (const { tt, key, encode } of b.fields) {
          for (const value of encode((this as any)[key])) {
            elements.push([tt, value]);
          }
        }

        if (b.topTT === undefined) {
          encoder.encode(elements);
        } else {
          encoder.encode([b.topTT, ...elements]);
        }
      }

      public static decodeFrom(decoder: Decoder): S {
        assert(b.subclass, `StructBuilder(${b.typeName}).subclass is unset`);
        const t = new b.subclass();
        return b.EVD[b.topTT === undefined ? "decodeValue" : "decode"](t, decoder) as any;
      }

      public toString(): string {
        const tokens: string[] = [b.typeName];
        for (const { key, asString } of b.fields) {
          tokens.push(...asString((this as any)[key]));
        }
        return tokens.join("");
      }
    } as any;
  }
}

/**
 * Infer fields of a class built by StructBuilder.
 * @typeParam B - StructBuilder annotated with field typing.
 */
export type StructFields<B extends StructBuilder<{}>> = B extends StructBuilder<infer U> ? U : never;
