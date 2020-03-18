import { Component } from "./mod";

/** Naming convention, constructible from A and convertible to R. */
export interface NamingConvention<A = unknown, R = A> {
  /** Determine if a component follows this naming convention. */
  match(comp: Component): boolean;

  /** Create a component from input value following this naming convention. */
  create(v: A): Component;

  /** Parse value of a matched component. */
  parse(comp: Component): R;
}

export namespace NamingConvention {
  export interface WithAltUri {
    /** Get alternate/pretty URI of a matched component. */
    toAltUri(comp: Component): string;
  }
}
