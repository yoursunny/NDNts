import { Timestamp } from "@ndn/naming-convention2";
import type { Name } from "@ndn/packet";

import { AlternatePattern, Pattern, VariablePattern, Vars } from "../pattern";

/** A filter that matches Timestamp convention. */
export const timestamp = new VariablePattern.ConventionFilter(Timestamp);

/** A filter from a component constraint term. */
export class ConstraintTerm implements VariablePattern.Filter {
  constructor(public readonly id: string, public readonly pattern: Pattern) {}

  public accept(name: Name, vars: Vars) {
    void name;
    const value = vars.get(this.id);
    if (!value) {
      return false;
    }

    for (const m of this.pattern.match(value)) { // eslint-disable-line no-unreachable-loop
      void m;
      return true;
    }
    return false;
  }
}

/** Combine multiple filters where every filter must pass. */
export class And implements VariablePattern.Filter {
  constructor(public readonly filters: VariablePattern.Filter[]) {}

  public accept(name: Name, vars: Vars) {
    return this.filters.every((f) => f.accept(name, vars));
  }
}

/** Combine multiple filters where some filter must pass. */
export class Or implements VariablePattern.Filter {
  constructor(public readonly filters: VariablePattern.Filter[]) {}

  public accept(name: Name, vars: Vars) {
    return this.filters.some((f) => f.accept(name, vars));
  }
}

/** Simplify a filter. */
export function simplify(filter: VariablePattern.Filter): VariablePattern.Filter;

/**
 * Simplify a filter.
 * If allow set is specified, terms not in allow set are deleted.
 * If deny set is specified, terms in deny set are deleted.
 */
export function simplify(filter: VariablePattern.Filter, allow: Set<string> | undefined, deny?: Set<string>): VariablePattern.Filter | undefined;

export function simplify(filter: VariablePattern.Filter, allow?: Set<string>, deny?: Set<string>) {
  if (filter instanceof ConstraintTerm &&
      ((allow && !allow.has(filter.id) || deny?.has(filter.id)))) {
    return undefined;
  }

  const combine = filter instanceof And ? And : filter instanceof Or ? Or : undefined;
  if (!combine) {
    return filter;
  }

  const subs = (filter as And | Or).filters.flatMap((f) => {
    const s = simplify(f, allow, deny);
    return s instanceof combine ? s.filters : (s ?? []);
  });
  if (subs.length <= 1) {
    return subs[0];
  }
  return new combine(subs);
}

/**
 * Reduce a component constraint term as a Pattern if possible.
 * true means there's no restriction for the term.
 * false means the restriction cannot be translated to a Pattern.
 */
export function reduceTerm(filter: VariablePattern.Filter, id: string): Pattern | boolean {
  if (filter instanceof ConstraintTerm) {
    return filter.id !== id || filter.pattern;
  }
  if (filter instanceof And) {
    return filter.filters.map((f) => reduceTerm(f, id))
      .reduce((prev, m) => {
        if (typeof prev === "boolean") {
          return prev && m;
        }
        if (typeof m === "boolean") {
          return m && prev;
        }
        return false;
      }, true);
  }
  if (filter instanceof Or) {
    return filter.filters.map((f) => reduceTerm(f, id))
      .reduce((prev, m) => {
        if (prev instanceof Pattern && m instanceof Pattern) {
          return new AlternatePattern([prev, m]);
        }
        return !!(prev || m);
      }, true);
  }
  return false;
}
