import { TT } from "../an";
import { Component } from "./component";
import type { NamingConvention } from "./convention";
import { ImplicitDigest, ParamsDigest } from "./digest-comp";
import { Name } from "./name";

/**
 * Functions to print and parse names in alternate/pretty URI syntax.
 *
 * This class is constructed with a sequence of NamingConventions. Each component is matched
 * against these conventions in order, and the first matching convention can determine how to
 * print that component in an alternate URI syntax, if available.
 *
 * Other than pre-constructed 'AltUri' instances exported by this and naming convention packages,
 * you may construct an instance with only the naming conventions you have adopted, so that a
 * component that happens to match a convention that your application did not adopt is not
 * mistakenly interpreted with that convention.
 */
export class AltUriConverter {
  constructor(public readonly conventions: ReadonlyArray<NamingConvention<unknown> & NamingConvention.WithAltUri>) {}

  /** Print component in alternate URI syntax */
  public readonly ofComponent = (comp: Component) => {
    for (const conv of this.conventions) {
      if (conv.match(comp)) {
        return conv.toAltUri(comp);
      }
    }
    return comp.toString();
  };

  /** Print name in alternate URI syntax. */
  public readonly ofName = (name: Name) => `/${name.comps.map((comp) => this.ofComponent(comp)).join("/")}`;

  /** Parse component from alternate URI syntax */
  public readonly parseComponent = (input: string) => {
    for (const conv of this.conventions) {
      const comp = conv.fromAltUri(input);
      if (comp) {
        return comp;
      }
    }
    return Component.from(input);
  };

  /** Parse name from alternate URI syntax. */
  public readonly parseName = (input: string) => new Name(input, this.parseComponent);
}

class Generic implements NamingConvention<never>, NamingConvention.WithAltUri {
  public match({ type }: Component) { return type === TT.GenericNameComponent; }
  public create(): never { /* c8 ignore next */ throw new TypeError("not supported"); }
  public parse(): never { /* c8 ignore next */ throw new TypeError("not supported"); }
  public toAltUri(comp: Component) { return comp.toString().slice(2); }
  public fromAltUri() { return undefined; }
}

/** Print Generic, ImplicitDigest, ParamsDigest in alternate URI syntax. */
export const AltUri = new AltUriConverter([
  new Generic(),
  ImplicitDigest,
  ParamsDigest,
]);
