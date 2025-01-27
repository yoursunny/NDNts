import { Decoder, Encoder } from "@ndn/tlv";
import { toHex } from "@ndn/util";

import { TT } from "../an";
import { Component, type ComponentLike } from "./component";
import type { NamingConvention } from "./convention";

/** Name or Name URI. */
export type NameLike = Name | string;

/**
 * Name.
 *
 * @remarks
 * This type is immutable.
 */
export class Name {
  public static decodeFrom(decoder: Decoder): Name {
    const { value } = decoder.read();
    return new Name(value);
  }

  /**
   * Create Name from Name or Name URI.
   *
   * @remarks
   * This is more efficient than `new Name(input)` if input is already a Name.
   */
  public static from(input: NameLike): Name {
    return input instanceof Name ? input : new Name(input);
  }

  /** Create empty name, or copy from other name, or parse from URI. */
  constructor(input?: NameLike);

  /** Parse from URI, with specific component parser. */
  constructor(uri: string, parseComponent?: (input: string) => Component);

  /** Construct from TLV-VALUE. */
  constructor(value: Uint8Array);

  /** Construct from components. */
  constructor(comps: readonly ComponentLike[]);

  constructor(
      arg1?: NameLike | Uint8Array | readonly ComponentLike[],
      parseComponent: (input: string) => Component = Component.from,
  ) {
    if (arg1 === undefined) {
      this.valueEncoderBufSize = 0;
    } else if (arg1 instanceof Name) {
      this.comps = arg1.comps;
      this.value_ = arg1.value_;
      this.uri_ = arg1.uri_;
      this.hex_ = arg1.hex_;
    } else if (typeof arg1 === "string") {
      for (const comp of arg1.replace(/^(?:ndn:)?\/*/, "").split("/")) {
        if (comp !== "") {
          (this.comps as Component[]).push(parseComponent(comp));
        }
      }
      this.valueEncoderBufSize = arg1.length + 4 * this.comps.length;
    } else if (Array.isArray(arg1)) {
      this.comps = Array.from(arg1 as readonly ComponentLike[], Component.from);
    } else if (arg1 instanceof Uint8Array) {
      this.value_ = arg1;
      const decoder = new Decoder(this.value_);
      while (!decoder.eof) {
        (this.comps as Component[]).push(decoder.decode(Component));
      }
    }
  }

  /** List of name components. */
  public readonly comps: readonly Component[] = [];

  private readonly valueEncoderBufSize?: number;
  private value_?: Uint8Array;
  private uri_?: string;
  private hex_?: string;

  /** Number of name components. */
  public get length(): number {
    return this.comps.length;
  }

  /** Name TLV-VALUE. */
  public get value(): Uint8Array {
    this.value_ ??= Encoder.encode(this.comps, this.valueEncoderBufSize ?? 256);
    return this.value_;
  }

  /** Name TLV-VALUE hexadecimal representation, good for map keys. */
  public get valueHex(): string {
    this.hex_ ??= toHex(this.value);
    return this.hex_;
  }

  /**
   * Retrieve i-th component.
   * @param i - Component index. Negative number counts from the end.
   * @returns i-th component, or `undefined` if it does not exist.
   */
  public get(i: number): Component | undefined {
    return this.comps.at(i);
  }

  /**
   * Retrieve i-th component.
   * @param i - Component index. Negative number counts from the end.
   * @returns i-th component.
   *
   * @throws RangeError
   * Thrown if i-th component does not exist.
   */
  public at(i: number): Component {
    const comp = this.get(i);
    if (!comp) {
      throw new RangeError(`component ${i} out of range`);
    }
    return comp;
  }

  /** Get URI string. */
  public toString(): string {
    this.uri_ ??= `/${this.comps.map((comp) => comp.toString()).join("/")}`;
    return this.uri_;
  }

  /** Get sub name `[begin,end)`. */
  public slice(begin?: number, end?: number): Name {
    return new Name(this.comps.slice(begin, end));
  }

  /** Get prefix of `n` components. */
  public getPrefix(n: number): Name {
    return this.slice(0, n);
  }

  /** Append a component from naming convention. */
  public append<A>(convention: NamingConvention<A, unknown>, v: A): Name;

  /** Append suffix with one or more components. */
  public append(...suffix: readonly ComponentLike[]): Name;

  public append(...args: unknown[]) {
    let suffix: readonly ComponentLike[];
    if (args.length === 2 &&
        typeof (args[0] as NamingConvention<unknown>).create === "function") {
      suffix = [(args[0] as NamingConvention<unknown>).create(args[1])];
    } else {
      suffix = args as readonly ComponentLike[];
    }
    return new Name([...this.comps, ...suffix]);
  }

  /** Return a copy of Name with i-th component replaced with `comp`. */
  public replaceAt(i: number, comp: ComponentLike): Name {
    return new Name((this.comps as readonly ComponentLike[]).toSpliced(i, 1, comp));
  }

  /** Compare with other name. */
  public compare(other: NameLike): Name.CompareResult {
    return Name.compare(this, Name.from(other));
  }

  /** Determine if this name equals other. */
  public equals(other: NameLike): boolean {
    other = Name.from(other);
    if (this.hex_ !== undefined && other.hex_ !== undefined) {
      return this.hex_ === other.hex_;
    }
    return this.length === other.length && comparePrefix(this, other, this.length) === Name.CompareResult.EQUAL;
  }

  /** Determine if this name is a prefix of other. */
  public isPrefixOf(other: NameLike): boolean {
    other = Name.from(other);
    if (this.hex_ !== undefined && other.hex_ !== undefined) {
      return other.hex_.startsWith(this.hex_);
    }
    return this.length <= other.length && comparePrefix(this, other, this.length) === Name.CompareResult.EQUAL;
  }

  public encodeTo(encoder: Encoder) {
    if (this.value_) {
      encoder.prependTlv(TT.Name, this.value_);
    } else {
      encoder.prependTlv(TT.Name, ...this.comps);
    }
  }
}

export namespace Name {
  /** Determine if obj is Name or Name URI. */
  export function isNameLike(obj: any): obj is NameLike {
    return obj instanceof Name || typeof obj === "string";
  }

  /** Name compare result. */
  export enum CompareResult {
    /** lhs is less than, but not a prefix of rhs */
    LT = -2,
    /** lhs is a prefix of rhs */
    LPREFIX = -1,
    /** lhs and rhs are equal */
    EQUAL = 0,
    /** rhs is a prefix of lhs */
    RPREFIX = 1,
    /** rhs is less than, but not a prefix of lhs */
    GT = 2,
  }

  /** Compare two names. */
  export function compare(lhs: Name, rhs: Name): CompareResult {
    const commonSize = Math.min(lhs.length, rhs.length);
    const cmp = comparePrefix(lhs, rhs, commonSize);
    if (cmp !== CompareResult.EQUAL) {
      return cmp;
    }

    if (lhs.length > commonSize) {
      return CompareResult.RPREFIX;
    }
    if (rhs.length > commonSize) {
      return CompareResult.LPREFIX;
    }
    return CompareResult.EQUAL;
  }
}

/** Compare first n components between two names. */
function comparePrefix(lhs: Name, rhs: Name, n: number): Name.CompareResult {
  for (let i = 0; i < n; ++i) {
    const cmp = lhs.comps[i]!.compare(rhs.comps[i]!);
    if (cmp !== Component.CompareResult.EQUAL) {
      return cmp as unknown as Name.CompareResult;
    }
  }
  return Name.CompareResult.EQUAL;
}
