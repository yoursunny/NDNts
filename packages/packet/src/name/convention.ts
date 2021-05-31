import type { Component } from "./component";

/**
 * Naming convention, which interprets a name component in a specific way.
 * @template A input type to construct component.
 * @template R output type to interpret component.
 */
export interface NamingConvention<A, R = A> {
  /** Determine if a component follows this naming convention. */
  match: (comp: Component) => boolean;

  /** Create a component from input value following this naming convention. */
  create: (v: A) => Component;

  /** Parse value of a matched component. */
  parse: (comp: Component) => R;
}

export namespace NamingConvention {
  /** A naming convention that supports alternate/pretty URI. */
  export interface WithAltUri {
    /** Convert to alternate URI. */
    toAltUri: (comp: Component) => string;

    /**
     * Parse from alternate URI.
     * @returns component, or undefined if it cannot be parsed.
     */
    fromAltUri: (input: string) => Component | undefined;
  }

  export function isConvention(obj: any): obj is NamingConvention<any> {
    return typeof obj === "object" &&
           typeof obj.match === "function" &&
           typeof obj.create === "function" &&
           typeof obj.parse === "function";
  }
}
