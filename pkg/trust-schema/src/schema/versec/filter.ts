import { SequenceNum, Timestamp } from "@ndn/naming-convention2";
import type { Name } from "@ndn/packet";
import take from "obliterator/take.js";

import { AlternatePattern, Pattern, VariablePattern, type Vars } from "../pattern";
import type * as A from "./ast";

/** Function in a call expression. */
export interface Callable {
  readonly nargs: number | [min: number, max: number];
  readonly asVariable?: boolean;
  readonly makeFilter?: (...args: readonly A.Expr[]) => VariablePattern.Filter;
}

/** A filter that matches {@link Timestamp} convention. */
const timestamp = new VariablePattern.ConventionFilter(Timestamp);

/** A filter that matches {@link SequenceNum} convention. */
const seq = new VariablePattern.ConventionFilter(SequenceNum);

export const builtinFunctions: Record<string, Callable> = {
  sysid: { nargs: 0, asVariable: true },
  host: { nargs: 0, asVariable: true },
  uid: { nargs: 0, asVariable: true },
  pid: { nargs: 0, asVariable: true },
  timestamp: {
    nargs: 0,
    makeFilter: () => timestamp,
  },
  seq: {
    nargs: 0,
    makeFilter: () => seq,
  },
};

export class FunctionFilter implements VariablePattern.Filter {
  constructor(
      public readonly callExpr: A.Call,
      public readonly inner: VariablePattern.Filter,
  ) {}

  public accept(name: Name, vars: Vars) {
    return this.inner.accept(name, vars);
  }
}

/** A filter from a component constraint term. */
export class ConstraintTerm implements VariablePattern.Filter {
  constructor(public readonly id: string, public readonly pattern: Pattern) {}

  public accept(name: Name, vars: Vars) {
    void name;
    const value = vars.get(this.id);
    return !!value && take(this.pattern.match(value), 1).length > 0;
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
 * @param allow - Allow set. Terms not in allow set are deleted.
 */
export function simplify(filter: VariablePattern.Filter, allow: ReadonlySet<string> | undefined): VariablePattern.Filter | undefined;

export function simplify(filter: VariablePattern.Filter, allow?: ReadonlySet<string>) {
  if (filter instanceof ConstraintTerm && allow && !allow.has(filter.id)) {
    return undefined;
  }

  const combine = filter instanceof And ? And : filter instanceof Or ? Or : undefined;
  if (!combine) {
    return filter;
  }

  const subs = (filter as And | Or).filters.flatMap((f) => {
    const s = simplify(f, allow);
    return s instanceof combine ? s.filters : (s ?? []);
  });
  if (subs.length <= 1) {
    return subs[0];
  }
  return new combine(subs);
}

/** Combine filters in AND relation. */
export function combine(...filters: ReadonlyArray<VariablePattern.Filter | undefined>): VariablePattern.Filter | undefined {
  filters = filters.filter((f) => f !== undefined);
  if (filters.length === 0) {
    return undefined;
  }
  return simplify(new And(filters as VariablePattern.Filter[]));
}

/**
 * Reduce a component constraint term as a {@link Pattern} if possible.
 * @returns
 * - `true`: there's no restriction for the term.
 * - `false`: the restriction cannot be translated to a Pattern.
 * - Pattern: translated pattern.
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
