import * as T from "./token";

/** A unit on the same nesting level. */
export type Unit = T.Token | Paren | Brace;

class Nested {
  protected constructor(
      public readonly left: T.Operator,
      public readonly mid: Unit[],
      public right: T.Operator,
  ) {}
}

/** Tokens enclosed in parens. */
export class Paren extends Nested {
  constructor(left: T.Operator, mid: Unit[] = []) {
    super(left, mid, new T.ParenR());
  }
}

/** Tokens enclosed in braces. */
export class Brace extends Nested {
  constructor(left: T.Operator, mid: Unit[] = []) {
    super(left, mid, new T.BraceR());
  }
}

/** Scan tokens into a sequences of units on the same nesting level. */
export function scan(tokens: Iterable<T.Token>): Unit[] {
  const topSequence: Unit[] = [];
  const nests: Nested[] = [];
  let currentSequence = topSequence;
  const pushNest = (n: Nested) => {
    currentSequence.push(n);
    nests.push(n);
    currentSequence = n.mid;
  };
  const popNest = (op: T.Operator) => {
    const n = nests.pop();
    if (n?.right.toString() !== op.toString()) {
      throw new Error(`unbalanced ${op}`);
    }
    n.right = op;
    currentSequence = nests.length > 0 ? nests.at(-1)!.mid : topSequence;
  };

  for (const token of tokens) {
    switch (true) {
      case token instanceof T.ParenL: {
        pushNest(new Paren(token));
        break;
      }
      case token instanceof T.BraceL: {
        pushNest(new Brace(token));
        break;
      }
      case token instanceof T.ParenR:
      case token instanceof T.BraceR: {
        popNest(token);
        break;
      }
      default: {
        currentSequence.push(token);
        break;
      }
    }
  }

  if (nests.length > 0) {
    throw new Error(`unbalanced ${nests.at(-1)!.left}`);
  }
  return topSequence;
}

/**
 * Split by operator.
 * @param sep - Separator operator type.
 * @param sequence - A sequence of units.
 * @param skipEmpty - Of true, empty sub sequences are skipped.
 * @returns Sub sequences.
 */
export function split(sep: typeof T.Operator, sequence: readonly Unit[], skipEmpty = false): Unit[][] {
  const result: Unit[][] = [];
  let sub: Unit[] = [];
  for (const u of sequence) {
    if (u instanceof sep) {
      if (sub.length > 0 || !skipEmpty) {
        result.push(sub);
      }
      sub = [];
    } else {
      sub.push(u);
    }
  }
  if (sub.length > 0 || !skipEmpty) {
    result.push(sub);
  }
  return result;
}

/** Strip outer parens. */
export function unParen(units: readonly Unit[]): readonly Unit[] {
  while (units.length === 1 && units[0] instanceof Paren) {
    units = units[0].mid;
  }
  return units;
}

/** Flatten sequence to tokens. */
export function* toTokens(...sequence: readonly Unit[]): Iterable<T.Token> {
  for (const u of sequence) {
    if (u instanceof Nested) {
      yield u.left;
      yield* toTokens(...u.mid);
      yield u.right;
    } else {
      yield u;
    }
  }
}
