import { Component, type ComponentLike, NamingConvention, TT } from "@ndn/packet";

import { PrefixRegDynamic } from "./dynamic";
import type { PrefixRegController } from "./types";

/**
 * Register prefixes after stripping last few components matching a predicate.
 *
 * @remarks
 * Warning: this may misbehave when {@link DataStore.InsertOptions.expireTime} is being used.
 */
export function PrefixRegStrip(...predicates: readonly PrefixRegStrip.ComponentPredicate[]): PrefixRegController {
  const preds = predicates.map((pred) => {
    if (typeof pred === "function") {
      return pred;
    }
    if (NamingConvention.isConvention(pred)) {
      return (c: Component) => pred.match(c);
    }
    const comp = Component.from(pred);
    return (c: Component) => c.equals(comp);
  });
  return PrefixRegDynamic((name) => {
    let i = name.length - 1;
    for (; i >= 0; --i) {
      const c = name.get(i)!;
      if (!preds.some((pred) => pred(c))) {
        break;
      }
    }
    return name.getPrefix(i + 1);
  });
}

export namespace PrefixRegStrip {
  export type ComponentPredicate = ComponentLike | ((c: Component) => boolean) | NamingConvention<any>;

  /** A predicate that strips non-generic components. */
  export function stripNonGeneric(c: Component): boolean {
    return c.type !== TT.GenericNameComponent;
  }
}
