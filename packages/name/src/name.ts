import { Decoder, Encoder } from "@ndn/tlv";

import { TT } from "./an";
import { Component, ComponentLike } from "./component";
import { NamingConvention } from "./convention";

export type NameLike = Name | string;

/**
 * Name.
 * This type is immutable.
 */
export class Name {
  public static decodeFrom(decoder: Decoder): Name {
    const self = new Name();
    const { vd } = decoder.read();
    while (!vd.eof) {
      self.comps_.push(vd.decode(Component));
    }
    return self;
  }

  private comps_: Component[];

  /**
   * Create empty name, or copy from other name, or parse from URI.
   */
  constructor(input?: NameLike);

  /**
   * Create from components.
   */
  constructor(comps: ComponentLike[]);

  constructor(arg1?) {
    this.comps_ = [];
    if (arg1 instanceof Name) {
      this.comps_ = this.comps_.concat(arg1.comps_);
    } else if (typeof arg1 === "string") {
      this.comps_ = arg1.replace(/^(?:ndn)?\//, "").split("/").map(Component.from);
    } else if (Array.isArray(arg1)) {
      this.comps_ = arg1.map(Component.from);
    }
  }

  public get size(): number {
    return this.comps_.length;
  }

  /**
   * Retrieve i-th component.
   */
  public get(i: number): Component|undefined {
    i = i < 0 ? i + this.size : i;
    return this.comps_[i];
  }

  /**
   * Retrieve i-th component.
   * @throws i-th component does not exist.
   */
  public at(i: number): Component {
    const comp = this.get(i);
    if (typeof comp === "undefined") {
      throw new Error("component " + i + " out of range");
    }
    return comp;
  }

  /**
   * Get URI string.
   */
  public toString(): string {
    return "/" + this.comps_.map((comp) => comp.toString()).join("/");
  }

  /**
   * Get sub name [begin, end).
   */
  public slice(begin?: number, end?: number): Name {
    return new Name(this.comps_.slice(begin, end));
  }

  /**
   * Get prefix of n components.
   */
  public getPrefix(n: number): Name {
    return this.slice(0, n);
  }

  /**
   * Append a component from naming convention.
   */
  public append<T>(convention: NamingConvention<T>, v: T): Name;

  /**
   * Append suffix with one or more components.
   */
  public append(...suffix: ComponentLike[]): Name;

  public append(...args) {
    if (NamingConvention.isNamingConvention(args[0])) {
      const convention = args[0];
      return this.append(convention.create(args[1]));
    }
    const suffix = args as ComponentLike[];
    return new Name(this.comps_.concat(suffix.map(Component.from)));
  }

  /**
   * Compare with other name.
   */
  public compare(other: NameLike): Name.CompareResult {
    const rhs = new Name(other);
    const commonSize = Math.min(this.size, rhs.size);
    for (let i = 0; i < commonSize; ++i) {
      const cmp = this.comps_[i].compare(rhs.comps_[i]);
      if (cmp !== Component.CompareResult.EQUAL) {
        return cmp as unknown as Name.CompareResult;
      }
    }
    if (this.size > commonSize) {
      return Name.CompareResult.RPREFIX;
    }
    if (rhs.size > commonSize) {
      return Name.CompareResult.LPREFIX;
    }
    return Name.CompareResult.EQUAL;
  }

  /**
   * Determine if this name equals other.
   */
  public equals(other: NameLike): boolean {
    return this.compare(other) === Name.CompareResult.EQUAL;
  }

  /**
   * Determine if this name is a prefix of other.
   */
  public isPrefixOf(other: NameLike): boolean {
    const cmp = this.compare(other);
    return cmp === Name.CompareResult.EQUAL || cmp === Name.CompareResult.LPREFIX;
  }

  public encodeTo(encoder: Encoder) {
    encoder.prependTlv.apply(encoder, ([TT.Name] as any).concat(this.comps_));
  }
}

export namespace Name {
  export function isNameLike(obj: any): obj is NameLike {
    return obj instanceof Name || typeof obj === "string";
  }

  /**
   * Name compare result.
   */
  export enum CompareResult {
    /** lhs is less than, but not a prefix of rhs */
    LT = Component.CompareResult.LT,
    /** lhs is a prefix of rhs */
    LPREFIX = -1,
    /** lhs and rhs are equal */
    EQUAL = Component.CompareResult.EQUAL,
    /** rhs is a prefix of lhs */
    RPREFIX = 1,
    /** rhs is less than, but not a prefix of lhs */
    GT = Component.CompareResult.GT,
  }
}
