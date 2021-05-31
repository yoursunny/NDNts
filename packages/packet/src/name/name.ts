import { Decoder, Encoder } from "@ndn/tlv";

import { TT } from "../an";
import { Component, ComponentLike } from "./component";
import type { NamingConvention } from "./convention";

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

  /** TLV-VALUE of the Name. */
  public readonly value: Uint8Array;
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
      parseComponentUri = Component.from as any,
  ) {
    let valueEncoderBufSize = 256;
    switch (true) {
      case arg1 instanceof Name: {
        const other = arg1 as Name;
        this.value = other.value;
        this.comps = other.comps;
        return;
      }
      case typeof arg1 === "string": {
        const uri = arg1 as string;
        this.comps = uri.replace(/^(?:ndn:)?\/?/, "").split("/")
          .filter((comp) => comp !== "").map(parseComponentUri);
        valueEncoderBufSize = uri.length + 4 * this.comps.length;
        break;
      }
      case Array.isArray(arg1):
        this.comps = (arg1 as readonly ComponentLike[]).map(Component.from);
        break;
      case arg1 instanceof Uint8Array: {
        this.value = arg1 as Uint8Array;
        const comps = [] as Component[];
        const decoder = new Decoder(this.value);
        while (!decoder.eof) {
          comps.push(decoder.decode(Component));
        }
        this.comps = comps;
        return;
      }
      default: // undefined
        this.value = new Uint8Array();
        this.comps = [];
        return;
    }
    this.value = Encoder.encode(this.comps, valueEncoderBufSize);
  }

  public get length(): number {
    return this.comps.length;
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
    if (typeof comp === "undefined") {
      throw new Error(`component ${i} out of range`);
    }
    return comp;
  }

  /** Get URI string. */
  public toString(): string {
    return `/${this.comps.map((comp) => comp.toString()).join("/")}`;
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
    if (args.length === 2 && typeof args[0] === "object" &&
        typeof (args[0] as any).create === "function") {
      const convention = args[0] as NamingConvention<any>;
      return this.append(convention.create(args[1]));
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
    const rhs = new Name(other);
    const commonSize = Math.min(this.length, rhs.length);
    for (let i = 0; i < commonSize; ++i) {
      const cmp = this.comps[i]!.compare(rhs.comps[i]!);
      if (cmp !== Component.CompareResult.EQUAL) {
        return cmp as unknown as Name.CompareResult;
      }
    }
    if (this.length > commonSize) {
      return Name.CompareResult.RPREFIX;
    }
    if (rhs.length > commonSize) {
      return Name.CompareResult.LPREFIX;
    }
    return Name.CompareResult.EQUAL;
  }

  /** Determine if this name equals other. */
  public equals(other: NameLike): boolean {
    return this.compare(other) === Name.CompareResult.EQUAL;
  }

  /** Determine if this name is a prefix of other. */
  public isPrefixOf(other: NameLike): boolean {
    const cmp = this.compare(other);
    return cmp === Name.CompareResult.EQUAL || cmp === Name.CompareResult.LPREFIX;
  }

  public encodeTo(encoder: Encoder) {
    encoder.prependTlv(TT.Name, this.value);
  }
}

export namespace Name {
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
}
