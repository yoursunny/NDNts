import { Decoder, Encodable, Encoder, fromHex,toHex } from "@ndn/tlv";

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
    const t = new Name();
    const { vd } = decoder.read();
    while (!vd.eof) {
      t.comps_.push(vd.decode(Component));
    }
    return t;
  }

  public get comps() { return this.comps_; }

  /** Obtain an Encodable for TLV-VALUE only. */
  public get valueOnly(): Encodable {
    return {
      encodeTo: (encoder: Encoder) => {
        encoder.prependValue(...this.comps_);
      },
    };
  }

  private comps_: Component[];

  /** Create empty name, or copy from other name, or parse from URI. */
  constructor(input?: NameLike);

  /** Create from components. */
  constructor(comps: ComponentLike[]);

  constructor(arg1?: NameLike|ComponentLike[]) {
    this.comps_ = [];
    if (arg1 instanceof Name) {
      this.comps_ = this.comps_.concat(arg1.comps_);
    } else if (typeof arg1 === "string") {
      this.comps_ = arg1.replace(/^(?:ndn)?\//, "").split("/")
                    .filter((comp) => comp !== "").map(Component.from);
    } else if (Array.isArray(arg1)) {
      this.comps_ = arg1.map(Component.from);
    }
  }

  public get length(): number {
    return this.comps_.length;
  }

  /** Retrieve i-th component. */
  public get(i: number): Component|undefined {
    i = i < 0 ? i + this.length : i;
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

  /** Get URI string. */
  public toString(): string {
    return "/" + this.comps_.map((comp) => comp.toString()).join("/");
  }

  /** Get sub name [begin, end). */
  public slice(begin?: number, end?: number): Name {
    return new Name(this.comps_.slice(begin, end));
  }

  /** Get prefix of n components. */
  public getPrefix(n: number): Name {
    return this.slice(0, n);
  }

  /** Append a component from naming convention. */
  public append<A>(convention: NamingConvention<A, unknown>, v: A): Name;

  /** Append suffix with one or more components. */
  public append(...suffix: ComponentLike[]): Name;

  public append(...args: any[]) {
    if (args.length === 2 && typeof args[0] === "object" && typeof args[0].create === "function") {
      const convention = args[0] as NamingConvention<unknown, unknown>;
      return this.append(convention.create(args[1]));
    }
    const suffix = args as ComponentLike[];
    return new Name(this.comps_.concat(suffix.map(Component.from)));
  }

  /** Return a copy of Name with a component replaced. */
  public replaceAt(i: number, comp: ComponentLike): Name {
    const copy = new Name(this);
    copy.comps.splice(i, 1, Component.from(comp));
    return copy;
  }

  /** Compare with other name. */
  public compare(other: NameLike): Name.CompareResult {
    const rhs = new Name(other);
    const commonSize = Math.min(this.length, rhs.length);
    for (let i = 0; i < commonSize; ++i) {
      const cmp = this.comps_[i].compare(rhs.comps_[i]);
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
    encoder.prependTlv(TT.Name, ...this.comps_);
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

  /** Obtain a string representation usable as record key. */
  export function toStringKey(name: Name): string {
    return name.comps.map(({ type, value }) => `${type}=${toHex(value)}`).join("/");
  }

  export function fromStringKey(s: string): Name {
    if (s === "") {
      return new Name();
    }
    return new Name(
      s.split("/")
      .map((c) => {
        const [type, value] = c.split("=");
        return new Component(parseInt(type, 10), fromHex(value));
      })
    );
  }
}
