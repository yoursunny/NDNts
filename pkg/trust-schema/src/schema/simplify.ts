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
    return simpAlternate(p);
  }
  if (p instanceof OverlapPattern) {
    return simpOverlap(p);
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
  // flatten ConcatPattern
  const flattened = flatten(p, ConcatPattern, "parts");

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

function simpAlternate(p: AlternatePattern): Pattern {
  // flatten AlternatePattern
  const flattened = flatten(p, AlternatePattern, "choices");

  // reduce to the only choice
  if (flattened.length === 1) {
    return flattened[0]!;
  }
  return new AlternatePattern(flattened);
}

function simpOverlap(p: OverlapPattern): Pattern {
  // flatten OverlapPattern
  const flattened = flatten(p, OverlapPattern, "branches");

  // reduce to the only branch
  if (flattened.length === 1) {
    return flattened[0]!;
  }
  return new OverlapPattern(flattened);
}

function flatten<K extends string, T extends { [k in K]: readonly Pattern[] }>(
    p: T, ctor: new() => T, field: K,
): Pattern[] {
  return p[field].flatMap((c) => {
    if (c instanceof ctor) {
      return flatten(c, ctor, field);
    }
    return simplifyPattern(c);
  });
}
