import { Component } from ".";

/** Naming convention, constructible from A and convertible to R. */
export interface NamingConvention<A, R> {
  /** Determine if a component follows this naming convention. */
  match(comp: Component): boolean;

  /** Create a component from input value following this naming convention. */
  create(v: A): Component;

  /** Parse value from a component following this naming convention. */
  parse(comp: Component): R;
}
