import { Decoder, Encoder } from "@ndn/tlv";
import { toHex } from "@ndn/util";

import { TT } from "../an";
import { type ComponentLike, Component } from "./component";
import type { NamingConvention } from "./convention";

/** Name or Name URI. */
export type NameLike = Name | string;

/**
 * Name.
 * This type is immutable.
 */
export class Name {
  public static decodeFrom(decoder: Decoder): Name {
    const { value } = decoder.read();
    return new Name(value);
  }

  /** List of name components. */
  public readonly comps: readonly Component[];

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
      parseComponent = Component.from as any,
  ) {
    switch (true) {
      case arg1 instanceof Name: {
        const other = arg1 as Name;
        this.comps = other.comps;
        this.value_ = other.value_;
        break;
      }
      case typeof arg1 === "string": {
        const uri = arg1 as string;
        this.comps = uri.replace(/^(?:ndn:)?\/*/, "").split("/")
          .filter((comp) => comp !== "").map(parseComponent);
        this.valueEncoderBufSize = uri.length + 4 * this.comps.length;
        break;
      }
      case Array.isArray(arg1): {
        this.comps = Array.from(arg1 as readonly ComponentLike[], Component.from);
        break;
      }
      case arg1 instanceof Uint8Array: {
        this.value_ = arg1 as Uint8Array;
        const comps = [] as Component[];
        const decoder = new Decoder(this.value_);
        while (!decoder.eof) {
          comps.push(decoder.decode(Component));
        }
        this.comps = comps;
        break;
      }
      default: { // undefined
        this.comps = [];
        this.valueEncoderBufSize = 0;
        break;
      }
    }
  }

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
    if (!this.value_) {
      this.value_ = Encoder.encode(this.comps, this.valueEncoderBufSize ?? 256);
    }
    return this.value_;
  }

  /** Name TLV-VALUE hexadecimal representation, good for map keys. */
  public get valueHex(): string {
    this.hex_ ??= toHex(this.value);
    return this.hex_;
  }

  /** Retrieve i-th component. */
  public get(i: number): Component | undefined {
    i = i < 0 ? i + this.length : i;
    return this.comps[i];
  }

  /**
   * Retrieve i-th component.
   * @throws i-th component does not exist.
   */
  public at(i: number): Component {
    const comp = this.get(i);
    if (!comp) {
      throw new Error(`component ${i} out of range`);
    }
    return comp;
  }

  /** Get URI string. */
  public toString(): string {
    this.uri_ ??= `/${this.comps.map((comp) => comp.toString()).join("/")}`;
    return this.uri_;
  }

  /** Get sub name [begin, end). */
  public slice(begin?: number, end?: number): Name {
    return new Name(this.comps.slice(begin, end));
  }

  /** Get prefix of n components. */
  public getPrefix(n: number): Name {
    return this.slice(0, n);
  }

  /** Append a component from naming convention. */
  public append<A>(convention: NamingConvention<A, unknown>, v: A): Name;

  /** Append suffix with one or more components. */
  public append(...suffix: readonly ComponentLike[]): Name;

  public append(...args: unknown[]) {
    if (args.length === 2 &&
        typeof (args[0] as NamingConvention<any>).create === "function") {
      return this.append((args[0] as NamingConvention<any>).create(args[1]));
    }
    const suffix = args as readonly ComponentLike[];
    return new Name([...this.comps, ...suffix]);
  }

  /** Return a copy of Name with a component replaced. */
  public replaceAt(i: number, comp: ComponentLike): Name {
    const comps: ComponentLike[] = [...this.comps];
    comps.splice(i, 1, comp);
    return new Name(comps);
  }

  /** Compare with other name. */
  public compare(other: NameLike): Name.CompareResult {
    other = Name.from(other);
    const commonSize = Math.min(this.length, other.length);
    const cmp = this.comparePrefix(other, commonSize);
    if (cmp !== Name.CompareResult.EQUAL) {
      return cmp;
    }

    if (this.length > commonSize) {
      return Name.CompareResult.RPREFIX;
    }
    if (other.length > commonSize) {
      return Name.CompareResult.LPREFIX;
    }
    return Name.CompareResult.EQUAL;
  }

  /** Determine if this name equals other. */
  public equals(other: NameLike): boolean {
    other = Name.from(other);
    if (this.hex_ !== undefined && other.hex_ !== undefined) {
      return this.hex_ === other.hex_;
    }
    return this.length === other.length && this.comparePrefix(other, this.length) === Name.CompareResult.EQUAL;
  }

  /** Determine if this name is a prefix of other. */
  public isPrefixOf(other: NameLike): boolean {
    other = Name.from(other);
    return this.length <= other.length && this.comparePrefix(other, this.length) === Name.CompareResult.EQUAL;
  }

  private comparePrefix(other: Name, n: number): Name.CompareResult {
    for (let i = 0; i < n; ++i) {
      const cmp = this.comps[i]!.compare(other.comps[i]!);
      if (cmp !== Component.CompareResult.EQUAL) {
        return cmp as unknown as Name.CompareResult;
      }
    }
    return Name.CompareResult.EQUAL;
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
  export function isNameLike(obj: any): obj is NameLike {
    return obj instanceof Name || typeof obj === "string";
  }

  export function from(input: NameLike): Name {
    return input instanceof Name ? input : new Name(input);
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
}
