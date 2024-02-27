import { assert } from "@ndn/util";
import type { Constructor, IfNever, Simplify } from "type-fest";

import { type Decodable, type Decoder } from "./decoder";
import { type EncodableObj, type Encoder } from "./encoder";
import { EvDecoder } from "./ev-decoder";
import { encodeFields, type Field, makeField, sortFields } from "./impl-field";
import type { StructFieldType } from "./struct-field";

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
 * each field only once. To be compatible with StructBuilder, the TLV structure being described
 * shall contain a sequence of sub-TLV elements with distinct TLV-TYPE numbers, where each
 * sub-TLV-TYPE appears zero, one, or multiple times.
 *
 * To use StructBuilder, calling code should follow these steps:
 * 1. Invoke `.add()` method successively to define sub-TLV elements.
 * 2. Obtain a base class via `.baseClass()` method, which contains one field for each sub-TLV-TYPE
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
    const field = makeField(tt, key, type, opts, this.EVD);
    const { flagPrefix = key, flagBits } = opts;

    if (flagBits) {
      field.asString = function*(v: unknown) {
        if (typeof v !== "number") {
          return;
        }
        yield ` ${key}=0x${v.toString(16).toUpperCase()}(`;
        let delim = "";
        for (const [str, bit] of Object.entries<number>(flagBits)) {
          if ((v & bit) !== 0) {
            yield `${delim}${str}`;
            delim = "|";
          }
        }
        yield ")";
      };

      for (const [str, bit] of Object.entries<number>(flagBits)) {
        const prop = flagPrefix + str.slice(0, 1).toUpperCase() + str.slice(1);
        this.flagBits.push({ key, prop, bit });
      }
    }

    this.fields.push(field);
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
    sortFields(this.fields);
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
        const elements = encodeFields(b.fields, this);

        if (b.topTT === undefined) {
          encoder.encode(elements);
        } else {
          encoder.prependTlv(b.topTT, ...elements);
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
