import { Component, ImplicitDigest, Name, NamingConvention, ParamsDigest, TT } from "./mod";

/**
 * Functions to print name or component in alternate/pretty URI syntax.
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
export class AltUriPrinter {
  constructor(public readonly conventions: ReadonlyArray<NamingConvention<any>&NamingConvention.WithAltUri>) {
  }

  /** Print component in alternate URI syntax */
  public ofComponent(comp: Component): string {
    for (const conv of this.conventions) {
      if (conv.match(comp)) {
        return conv.toAltUri(comp);
      }
    }
    return comp.toString();
  }

  /** Print name in alternate URI syntax. */
  public ofName(name: Name): string {
    return `/${name.comps.map((comp) => this.ofComponent(comp)).join("/")}`;
  }
}

class Generic implements NamingConvention<never>, NamingConvention.WithAltUri {
  public match(comp: Component) { return comp.type === TT.GenericNameComponent; }
  public create(): Component { /* istanbul ignore next */ throw new TypeError("not supported"); }
  public parse(): never { /* istanbul ignore next */ throw new TypeError("not supported"); }
  public toAltUri(comp: Component) { return comp.toString().slice(2); }
}

/** Print Generic, ImplicitDigest, ParamsDigest in alternate URI syntax. */
export const AltUri = new AltUriPrinter([
  new Generic(),
  ImplicitDigest,
  ParamsDigest,
]);
