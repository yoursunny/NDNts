import { Decoder, Encoder } from "@ndn/tlv";
import { TT } from "@ndn/tt-base";

import { Component, ComponentCompareResult, ComponentLike } from "./component";
import { isNamingConvention, NamingConvention } from "./convention";

export type NameLike = Name | string;

/**
 * Name compare result.
 */
export enum NameCompareResult {
  /** lhs is less than, but not a prefix of rhs */
  LT = ComponentCompareResult.LT,
  /** lhs is a prefix of rhs */
  LPREFIX = -1,
  /** lhs and rhs are equal */
  EQUAL = ComponentCompareResult.EQUAL,
  /** rhs is a prefix of lhs */
  RPREFIX = 1,
  /** rhs is less than, but not a prefix of lhs */
  GT = ComponentCompareResult.GT,
}

/**
 * Name.
 * This type is immutable.
 */
export class Name {
  public static decodeFrom(decoder: Decoder): Name {
    const self = new Name();
    decoder.readTypeExpect(TT.Name);
    const vDecoder = decoder.createValueDecoder();
    while (!vDecoder.eof) {
      self.comps_.push(vDecoder.decode(Component));
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
    if (isNamingConvention(args[0])) {
      const convention = args[0];
      return this.append(convention.create(args[1]));
    }
    const suffix = args as ComponentLike[];
    return new Name(this.comps_.concat(suffix.map(Component.from)));
  }

  /**
   * Compare with other name.
   */
  public compare(other: NameLike): NameCompareResult {
    const rhs = new Name(other);
    const commonSize = Math.min(this.size, rhs.size);
    for (let i = 0; i < commonSize; ++i) {
      const cmp = this.comps_[i].compare(rhs.comps_[i]);
      if (cmp !== ComponentCompareResult.EQUAL) {
        return cmp as unknown as NameCompareResult;
      }
    }
    if (this.size > commonSize) {
      return NameCompareResult.RPREFIX;
    }
    if (rhs.size > commonSize) {
      return NameCompareResult.LPREFIX;
    }
    return NameCompareResult.EQUAL;
  }

  /**
   * Determine if this name equals other.
   */
  public equals(other: NameLike): boolean {
    return this.compare(other) === NameCompareResult.EQUAL;
  }

  /**
   * Determine if this name is a prefix of other.
   */
  public isPrefixOf(other: NameLike): boolean {
    const cmp = this.compare(other);
    return cmp === NameCompareResult.EQUAL || cmp === NameCompareResult.LPREFIX;
  }

  public encodeTo(encoder: Encoder) {
    encoder.prependTlv.apply(encoder, ([TT.Name] as any).concat(this.comps_));
  }
}
