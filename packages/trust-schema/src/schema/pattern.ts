import { CertNaming } from "@ndn/keychain";
import { Component, Name, NameLike } from "@ndn/packet";

export type Vars = Record<string, Name>;
export type VarsLike = Readonly<Record<string, NameLike>>;

/** Context of matching a name. */
class MatchState {
  /**
   * Constructor.
   * @param name input name.
   * @param pos  position of first unconsumed component.
   * @param vars recognized variables.
   */
  constructor(
      public readonly name: Name,
      public readonly pos = 0,
      public readonly vars: Vars = {},
  ) {}

  /** Unconsumed name portion. */
  public get tail() { return this.name.slice(this.pos); }

  /** Length of unconsumed name. */
  public get tailLength() { return this.name.length - this.pos; }

  /** Get first i components of unconsumed name. */
  public tailPrefix(i: number) {
    return this.name.slice(this.pos, i >= 0 ? this.pos + i : i);
  }

  /** Whether the input name has been accepted by pattern. */
  public get accepted() {
    return this.tailLength === 0;
  }

  /**
   * Clone the state while consuming part of the name.
   * @param incrementPos how many components are consumed.
   * @param vars updated variables.
   */
  public extend(incrementPos: number, vars: Vars = {}): MatchState {
    return new MatchState(this.name, this.pos + incrementPos, { ...this.vars, ...vars });
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
}

/** Structure of a name. */
export abstract class Pattern {
  /** Convert to a simpler pattern if possible. */
  public simplify(): Pattern {
    return this;
  }

  /**
   * Determine whether a name matches the structure of this pattern.
   *
   * @param name input name.
   * @returns an iterable of extracted fields in possible interpretations.
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
   * @returns iterable of potential matches.
   */
  protected abstract matchState(state: MatchState): Iterable<MatchState>;

  /**
   * Build names following the structure of this pattern.
   *
   * @param vars variables to be replaced into the name.
   * @returns an iterable of possible names.
   */
  public *build(vars: VarsLike = {}): Iterable<Name> {
    const varsM = new Map<string, Name>();
    for (const [key, value] of Object.entries(vars)) {
      varsM.set(key, new Name(value));
    }
    const initial = new BuildState(new Name(), varsM);
    for (const final of this.buildState(initial)) {
      yield final.name;
    }
  }

  /**
   * Build part of an output name.
   * @returns iterable of potential constructions.
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
    this.name = new Name(name);
  }

  public readonly name: Name;

  protected *matchState(state: MatchState): Iterable<MatchState> {
    if (state.tailPrefix(this.name.length).equals(this.name)) {
      yield state.extend(this.name.length);
    }
  }

  protected *buildState(state: BuildState): Iterable<BuildState> {
    yield state.append(...this.name.comps);
  }
}

/**
 * Match or construct a variable name portion.
 *
 * When matching a name, this pattern extracts a number of name components,
 * and saves the sub-name in variables object in match() return value.
 *
 * When building a name, this pattern succeeds if the variable is present
 * in build() function argument.
 */
export class VariablePattern extends Pattern {
  /**
   * Constructor
   * @param id variable name.
   */
  constructor(
      public readonly id: string,
      {
        minComps = 1,
        maxComps = 1,
        accept = () => true,
      }: VariablePattern.Options = {},
  ) {
    super();
    this.minComps = minComps;
    this.maxComps = maxComps;
    this.accept = accept;
  }

  public readonly minComps: number;
  public readonly maxComps: number;
  public readonly accept: (part: Name) => boolean;

  protected *matchState(state: MatchState): Iterable<MatchState> {
    for (let i = this.minComps, max = Math.min(state.tailLength, this.maxComps); i <= max; ++i) {
      const part = state.tailPrefix(i);
      if (this.accept(part)) {
        yield state.extend(i, { [this.id]: part });
      }
    }
  }

  protected *buildState(state: BuildState): Iterable<BuildState> {
    const value = state.vars.get(this.id);
    if (value && value.length >= this.minComps && value.length <= this.maxComps && this.accept(value)) {
      yield state.append(...value.comps);
    }
  }
}
export namespace VariablePattern {
  export interface Options {
    /** Minimum number of components, default is 1. */
    minComps?: number;
    /** Maximum number of components, default is 1. */
    maxComps?: number;
    /** Function to determine whether a name part is acceptable. */
    accept?: (name: Name) => boolean;
  }
}

/**
 * Match or construct a KeyLocator or certificate name.
 *
 * To match a KeyLocator or certificate name, use a ConcatPattern that contains
 * patterns to match the subject name, followed by a CertNamePattern at last.
 * The captured variable contains the whole KeyLocator or certificate name that can
 * be further recognized by CertNaming.parseKeyName() and CertNaming.parseCertName().
 *
 * Using the same ConcatPattern, the constructed name would be the subject name.
 * It can be passed to keyChain.getSigner() to find a key/certificate.
 */
export class CertNamePattern extends Pattern {
  protected *matchState(state: MatchState): Iterable<MatchState> {
    if ([2, 4].includes(state.tailLength) &&
        state.name.get(state.pos)!.equals(CertNaming.KEY)) {
      yield state.extend(state.tailLength);
    }
  }

  protected *buildState(state: BuildState): Iterable<BuildState> {
    yield state;
  }
}

/** Concatenate several patterns. */
export class ConcatPattern extends Pattern {
  constructor(public readonly parts: Pattern[] = []) {
    super();
  }

  public simplify(): Pattern {
    // flatten ConcatPattern
    const flattened = this.flatten();

    // join adjacent ConstPattern
    const joined: Pattern[] = [];
    for (const part of flattened) {
      if (part instanceof ConstPattern &&
          joined.length > 0 &&
          joined[joined.length - 1] instanceof ConstPattern) {
        joined.push(new ConstPattern((joined.pop()! as ConstPattern).name.append(...part.name.comps)));
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

  private flatten(): Pattern[] {
    return this.parts.flatMap((p) => {
      if (p instanceof ConcatPattern) {
        return p.flatten();
      }
      return p.simplify();
    });
  }

  protected *matchState(state: MatchState, partIndex = 0): Iterable<MatchState> {
    if (partIndex >= this.parts.length) {
      yield state;
      return;
    }
    const part = this.parts[partIndex]!;
    for (const partial of Pattern.matchState(part, state)) {
      yield* this.matchState(partial, partIndex + 1);
    }
  }

  protected *buildState(state: BuildState, partIndex = 0): Iterable<BuildState> {
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

/**
 * Specify several alternate patterns in "OR" relation.
 *
 * When matching a name, the first successful match is returned.
 *
 * When building a name, the first choice that does not have missing variable is returned.
 */
export class AlternatePattern extends Pattern {
  constructor(public readonly choices: Pattern[] = []) {
    super();
  }

  public simplify(): Pattern {
    // flatten ConcatPattern
    const flattened = this.flatten();

    // reduce to the only choice
    if (flattened.length === 1) {
      return flattened[0]!;
    }
    return new AlternatePattern(flattened);
  }

  private flatten(): Pattern[] {
    return this.choices.flatMap((p) => {
      if (p instanceof AlternatePattern) {
        return p.flatten();
      }
      return p.simplify();
    });
  }

  protected *matchState(state: MatchState): Iterable<MatchState> {
    for (const choice of this.choices) {
      yield* Pattern.matchState(choice, state);
    }
  }

  protected *buildState(state: BuildState): Iterable<BuildState> {
    for (const choice of this.choices) {
      yield* Pattern.buildState(choice, state);
    }
  }
}
