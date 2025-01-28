import { AlternatePattern, ConcatPattern, ConstPattern, OverlapPattern, type Pattern, VariablePattern } from "./pattern";

/** Convert to a simpler pattern if possible. */
export function simplifyPattern(p: Pattern): Pattern {
  if (p instanceof VariablePattern) {
    return simpVariable(p);
  }
  if (p instanceof ConcatPattern) {
    return simpConcat(p);
  }
  if (p instanceof AlternatePattern) {
    return simpSequence(p, AlternatePattern, "choices");
  }
  if (p instanceof OverlapPattern) {
    return simpSequence(p, OverlapPattern, "branches");
  }
  return p;
}

function simpVariable(p: VariablePattern): Pattern {
  const inner = p.inner && simplifyPattern(p.inner);
  if (inner === p.inner) {
    return p;
  }
  return new VariablePattern(p.id, {
    ...p,
    inner,
  });
}

function simpConcat(p: ConcatPattern): Pattern {
  return simpSequence(p, ConcatPattern, "parts", (flattened) => {
    // join adjacent ConstPattern
    const joined: Pattern[] = [];
    for (const part of flattened) {
      if (part instanceof ConstPattern && joined.at(-1) instanceof ConstPattern) {
        joined.push(new ConstPattern((joined.pop() as ConstPattern).name.append(...part.name.comps)));
      } else {
        joined.push(part);
      }
    }
    return joined;
  });
}

function simpSequence<K extends string, T extends Pattern & { [k in K]: readonly Pattern[] }>(
    p: T, ctor: new(items: readonly Pattern[]) => T, field: K,
    reduce?: (items: Pattern[]) => Pattern[],
): Pattern {
  // flatten nested PatternT
  let flattened = flatten(p, ctor, field);

  if (reduce) {
    flattened = reduce(flattened);
  }

  // reduce to the only sub-pattern
  if (flattened.length === 1) {
    return flattened[0]!;
  }

  // construct new PatternT
  return new ctor(flattened);
}

function flatten<K extends string, T extends { [k in K]: readonly Pattern[] }>(
    p: T, ctor: new(items: readonly Pattern[]) => T, field: K,
): Pattern[] {
  return p[field].flatMap((c) => {
    if (c instanceof ctor) {
      return flatten(c, ctor, field);
    }
    return simplifyPattern(c);
  });
}
