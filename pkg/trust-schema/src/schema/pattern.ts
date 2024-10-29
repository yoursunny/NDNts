import { CertNaming } from "@ndn/keychain";
import { type Component, Name, type NameLike, type NamingConvention } from "@ndn/packet";
import some from "obliterator/some.js";

export type Vars = ReadonlyMap<string, Name>;
export namespace Vars {
  /** Check if lhs and rhs are consistent, i.e. have no key with different values. */
  export function consistent(lhs: Vars, rhs: Vars): boolean {
    for (const [k, lv] of lhs) {
      const rv = rhs.get(k);
      if (rv && !lv.equals(rv)) {
        return false;
      }
    }
    return true;
  }
}

export type VarsLike = Vars | Readonly<Record<string, NameLike>>;
export namespace VarsLike {
  /** Convert VarsLike to an iterable that may be passed to Map constructor to create Vars. */
  export function toIterable(vars: VarsLike): Iterable<[string, NameLike]> {
    return vars instanceof Map ? vars : Object.entries(vars);
  }
}

/** Context of matching a name. */
class MatchState {
  /**
   * Constructor.
   * @param name - Input name.
   * @param pos - Position of first unconsumed component.
   * @param vars - Recognized variables.
   */
  constructor(
      public readonly name: Name,
      public readonly pos = 0,
      public readonly vars: Vars = new Map<string, Name>(),
  ) {}

  /** Length of unconsumed name. */
  public get tailLength() { return this.name.length - this.pos; }

  /** Get first i components of unconsumed name. */
  public tail(i = Infinity) {
    return this.name.slice(this.pos, i >= 0 ? this.pos + i : i);
  }

  /** Whether the input name has been accepted by pattern. */
  public get accepted() {
    return this.tailLength === 0;
  }

  /**
   * Clone the state while consuming part of the name.
   * @param incrementPos - How many components are consumed.
   * @returns Updated state.
   */
  public extend(incrementPos: number): MatchState;

  /**
   * Clone the state while consuming part of the name.
   * @param incrementPos - How many components are consumed.
   * @param varsL - Updated variables.
   * @returns Updated state, or `false` if variables are inconsistent.
   */
  public extend(incrementPos: number, ...varsL: Array<Iterable<readonly [string, Name]>>): MatchState | false;

  public extend(incrementPos: number, ...varsL: Array<Iterable<readonly [string, Name]>>): any {
    const result = new Map(this.vars);
    for (const vars of varsL) {
      for (const [k, rv] of vars) {
        const lv = result.get(k);
        if (lv?.equals(rv) === false) {
          return false;
        }
        result.set(k, rv);
      }
    }
    return new MatchState(this.name, this.pos + incrementPos, result);
  }

  public toString(): string {
    return `MatchState(${this.name.getPrefix(this.pos)}; ${this.tail()}; ${
      Array.from(this.vars, ([k, v]) => `${k}=${v}`).join(", ")})`;
  }
}

/** Context of constructing a name. */
class BuildState {
  constructor(
      public readonly name: Name,
      public readonly vars: Map<string, Name>,
  ) {}

  public append(...comps: Component[]): BuildState {
    return new BuildState(this.name.append(...comps), this.vars);
  }

  public toString(): string {
    return `BuildState(${this.name}; ${
      Array.from(this.vars, ([k, v]) => `${k}=${v}`).join(", ")})`;
  }
}

/** Structure of a name. */
export abstract class Pattern {
  /** Convert to a simpler pattern if possible. */
  public simplify(): Pattern { // eslint-disable-line @typescript-eslint/prefer-return-this-type
    return this;
  }

  /**
   * Determine whether a name matches the structure of this pattern.
   * @param name - Input name.
   * @returns - Iterable of extracted fields in possible interpretations.
   */
  public *match(name: Name): Iterable<Vars> {
    const initial = new MatchState(name);
    for (const final of this.matchState(initial)) {
      if (final.accepted) {
        yield final.vars;
      }
    }
  }

  protected static matchState(p: Pattern, state: MatchState): Iterable<MatchState> {
    return p.matchState(state);
  }

  /**
   * Recognize part of the input name.
   * @returns Iterable of potential matches.
   */
  protected abstract matchState(state: MatchState): Iterable<MatchState>;

  /**
   * Build names following the structure of this pattern.
   * @param varsL - Sets of variables to be replaced into the name.
   * @returns Iterable of possible names.
   */
  public *build(...varsL: VarsLike[]): Iterable<Name> {
    const varsM = new Map<string, Name>();
    for (const vars of varsL) {
      for (const [k, v] of VarsLike.toIterable(vars)) {
        varsM.set(k, Name.from(v));
      }
    }

    const initial = new BuildState(new Name(), varsM);
    for (const final of this.buildState(initial)) {
      yield final.name;
    }
  }

  /**
   * Build part of an output name.
   * @returns Iterable of potential constructions.
   */
  protected static buildState(p: Pattern, state: BuildState): Iterable<BuildState> {
    return p.buildState(state);
  }

  protected abstract buildState(state: BuildState): Iterable<BuildState>;
}

/** Match or construct a constant name portion. */
export class ConstPattern extends Pattern {
  constructor(name: NameLike) {
    super();
    this.name = Name.from(name);
  }

  public readonly name: Name;

  protected override *matchState(state: MatchState): Iterable<MatchState> {
    if (state.tail(this.name.length).equals(this.name)) {
      yield state.extend(this.name.length);
    }
  }

  protected override *buildState(state: BuildState): Iterable<BuildState> {
    yield state.append(...this.name.comps);
  }
}

/**
 * Match or construct a variable name portion.
 *
 * @remarks
 * When matching a name, this pattern extracts a number of name components, and saves the sub-name
 * in variables object in {@link VariablePattern.match} return value.
 *
 * When building a name, this pattern succeeds if the variable is present in
 * {@link VariablePattern.build} function argument.
 */
export class VariablePattern extends Pattern {
  /**
   * Constructor
   * @param id - Variable name.
   */
  constructor(
      public readonly id: string,
      {
        minComps = 1,
        maxComps = 1,
        inner,
        filter,
      }: VariablePattern.Options = {},
  ) {
    super();
    this.minComps = minComps;
    this.maxComps = maxComps;
    this.inner = inner;
    this.filter = filter;
  }

  public readonly minComps: number;
  public readonly maxComps: number;
  public readonly inner?: Pattern;
  public readonly filter?: VariablePattern.Filter;

  public override simplify(): Pattern {
    const inner = this.inner?.simplify();
    if (inner === this.inner) {
      return this;
    }
    return new VariablePattern(this.id, {
      ...this,
      inner,
    });
  }

  private *innerMatch(value: Name, input?: Map<string, Name>): Iterable<Vars> {
    if (!this.inner) {
      yield new Map<string, Name>();
      return;
    }

    for (const m of this.inner.match(value)) {
      if (!input || Vars.consistent(input, m)) {
        yield m;
      }
    }
  }

  private filtersAccept(value: Name, vars: Vars): boolean {
    return !this.filter || this.filter.accept(value, vars);
  }

  protected override *matchState(state: MatchState): Iterable<MatchState> {
    for (let i = this.minComps, max = Math.min(state.tailLength, this.maxComps); i <= max; ++i) {
      const value = state.tail(i);
      for (const innerVars of this.innerMatch(value)) {
        const s = state.extend(i, innerVars, [[this.id, value]]);
        if (s && this.filtersAccept(value, s.vars)) {
          yield s;
        }
      }
    }
  }

  protected override *buildState(state: BuildState): Iterable<BuildState> {
    const value = state.vars.get(this.id);
    if (value) {
      if (value.length < this.minComps || value.length > this.maxComps) {
        return;
      }
      let hasMatch = false;
      for (const innerVars of this.innerMatch(value, state.vars)) {
        if (this.filtersAccept(value, innerVars)) {
          hasMatch = true;
          break;
        }
      }
      if (hasMatch) {
        yield state.append(...value.comps);
      }
      return;
    }

    if (!this.inner) {
      return;
    }

    for (const b of Pattern.buildState(this.inner, state)) {
      if (this.filtersAccept(b.name.slice(state.name.length), b.vars)) {
        yield b;
      }
    }
  }
}
export namespace VariablePattern {
  export interface Options {
    /**
     * Minimum number of components.
     * @defaultValue 1
     */
    minComps?: number;

    /**
     * Maximum number of components.
     * @defaultValue 1
     */
    maxComps?: number;

    /**
     * An overlay pattern that the name part must satisfy.
     *
     * @remarks
     * Setting this option effectively makes this variable an alias of the inner pattern.
     *
     * When building a name, if the variable of this pattern is present in
     * {@link VariablePattern.build} function argument, it is checked that the inner pattern
     * matches the name and its interpretation is consistent with other variables that are present.
     * Otherwise, the inner pattern is used to build the name.
     */
    inner?: Pattern;

    /** Filter that the name part must satisfy. */
    filter?: Filter;
  }

  /** Function to determine whether a name part is acceptable. */
  export interface Filter {
    accept: (name: Name, vars: Vars) => boolean;
  }

  /** Create a filter that accepts a name component if it satisfies a convention. */
  export class ConventionFilter implements Filter {
    constructor(public readonly convention: NamingConvention<any>) {}

    public accept(name: Name) {
      return name.length === 1 && name.get(0)!.is(this.convention);
    }
  }
}

/* eslint-disable tsdoc/syntax -- tsdoc-missing-reference */
/**
 * Match or construct a KeyLocator or certificate name.
 *
 * @remarks
 * To match a KeyLocator or certificate name, use a {@link ConcatPattern} that contains
 * patterns to match the subject name, followed by a {@link CertNamePattern} at last.
 * The captured variable contains the whole KeyLocator or certificate name that can
 * be further recognized by {@link CertNaming.parseKeyName} and {@link CertNaming.parseCertName}.
 *
 * Using the same {@link ConcatPattern}, the constructed name would be the subject name.
 * It can be passed to {@link \@ndn/keychain!KeyChain.getSigner} to find a key/certificate.
 */
/* eslint-enable tsdoc/syntax */
export class CertNamePattern extends Pattern {
  protected override *matchState(state: MatchState): Iterable<MatchState> {
    if ([2, 4].includes(state.tailLength) &&
        state.name.get(state.pos)!.equals(CertNaming.KEY)) {
      yield state.extend(state.tailLength);
    }
  }

  protected override *buildState(state: BuildState): Iterable<BuildState> {
    yield state;
  }
}

/** Concatenate several patterns. */
export class ConcatPattern extends Pattern {
  constructor(public readonly parts: Pattern[] = []) {
    super();
  }

  public override simplify(): Pattern {
    // flatten ConcatPattern
    const flattened = flatten(this, ConcatPattern, "parts");

    // join adjacent ConstPattern
    const joined: Pattern[] = [];
    for (const part of flattened) {
      if (part instanceof ConstPattern && joined.at(-1) instanceof ConstPattern) {
        joined.push(new ConstPattern((joined.pop() as ConstPattern).name.append(...part.name.comps)));
      } else {
        joined.push(part);
      }
    }

    // reduce to the only part
    if (joined.length === 1) {
      return joined[0]!;
    }
    return new ConcatPattern(joined);
  }

  protected override *matchState(state: MatchState, partIndex = 0): Iterable<MatchState> {
    if (partIndex >= this.parts.length) {
      yield state;
      return;
    }
    const part = this.parts[partIndex]!;
    for (const partial of Pattern.matchState(part, state)) {
      yield* this.matchState(partial, partIndex + 1);
    }
  }

  protected override *buildState(state: BuildState, partIndex = 0): Iterable<BuildState> {
    if (partIndex >= this.parts.length) {
      yield state;
      return;
    }
    const part = this.parts[partIndex]!;
    for (const partial of Pattern.buildState(part, state)) {
      yield* this.buildState(partial, partIndex + 1);
    }
  }
}

/** Specify several alternate patterns in "OR" relation. */
export class AlternatePattern extends Pattern {
  constructor(public readonly choices: Pattern[] = []) {
    super();
  }

  public override simplify(): Pattern {
    // flatten AlternatePattern
    const flattened = flatten(this, AlternatePattern, "choices");

    // reduce to the only choice
    if (flattened.length === 1) {
      return flattened[0]!;
    }
    return new AlternatePattern(flattened);
  }

  protected override *matchState(state: MatchState): Iterable<MatchState> {
    for (const choice of this.choices) {
      yield* Pattern.matchState(choice, state);
    }
  }

  protected override *buildState(state: BuildState): Iterable<BuildState> {
    for (const choice of this.choices) {
      yield* Pattern.buildState(choice, state);
    }
  }
}

/**
 * Specify several overlapped patterns in "AND" relation.
 *
 * @remarks
 * When matching a name, every branch of this pattern must extract the same number of name
 * components, and their variables must be consistent.
 *
 * When building a name, one branch is used to build the name as long as all required variables
 * are present, and then the built name must match all branches.
 */
export class OverlapPattern extends Pattern {
  constructor(public readonly branches: Pattern[] = []) {
    super();
  }

  public override simplify(): Pattern {
    // flatten OverlapPattern
    const flattened = flatten(this, OverlapPattern, "branches");

    // reduce to the only branch
    if (flattened.length === 1) {
      return flattened[0]!;
    }
    return new OverlapPattern(flattened);
  }

  protected override *matchState(state: MatchState, branchIndex = 0, lastMatch?: MatchState): Iterable<MatchState> {
    if (branchIndex >= this.branches.length) {
      if (lastMatch) {
        yield lastMatch;
      }
      return;
    }
    const branch = this.branches[branchIndex]!;
    for (const submatch of Pattern.matchState(branch, state)) {
      if (branchIndex > 0 && lastMatch!.pos !== submatch.pos) {
        continue;
      }
      yield* this.matchState(submatch.extend(state.pos - submatch.pos), branchIndex + 1, submatch);
    }
  }

  protected override *buildState(state: BuildState): Iterable<BuildState> {
    for (const branch of this.branches) {
      for (const built of Pattern.buildState(branch, state)) {
        const ms = new MatchState(built.name, state.name.length, built.vars);
        if (some(this.matchState(ms), (rematch) => rematch.accepted)) {
          yield built;
        }
      }
    }
  }
}

function flatten<T extends Pattern>(p: T, ctor: new() => T, field: keyof T): Pattern[] {
  return (p[field] as unknown as Pattern[]).flatMap((c) => {
    if (c instanceof ctor) {
      return flatten(c, ctor, field);
    }
    return c.simplify();
  });
}
