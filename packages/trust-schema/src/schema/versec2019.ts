import { AlternatePattern, CertNamePattern, ConcatPattern, ConstPattern, Pattern, VariablePattern } from "./pattern";
import { TrustSchemaPolicy } from "./policy";

class Parser {
  public readonly schema = new TrustSchemaPolicy();
  public lineNum = 0;

  public addPattern(line: string): void {
    const [id, input] = line.split("=", 2) as [string, string];
    this.schema.addPattern(id.trim(), this.parsePattern(input).simplify());
  }

  private parsePattern(input: string): Pattern {
    return this.parseAlternate(input);
  }

  private parseAlternate(input: string): Pattern {
    input = input.trim();
    const choices = this.parseSequence(input, "|", (token) => this.parseConcat(token));
    return new AlternatePattern(choices);
  }

  private parseConcat(input: string): Pattern {
    input = input.trim().replace(/^\/*/, "");
    const parts = this.parseSequence(input, "/", (token) => this.parseAtom(token));
    for (let i = parts.length - 1; i > 0; --i) {
      const front = parts[i - 1];
      const back = parts[i];
      if (front instanceof ConstPattern && back instanceof ConstPattern) {
        parts.splice(i - 1, 2, new ConstPattern(front.name.append(...back.name.comps)));
      }
    }
    return new ConcatPattern(parts);
  }

  private parseSequence(input: string, sep: string, subparser: ((input: string) => Pattern)): Pattern[] {
    const list: Pattern[] = [];

    let start = 0;
    let depth = 0;
    for (let i = 0; i < input.length; ++i) {
      switch (input.charAt(i)) {
        case "(":
        case "<":
          ++depth;
          break;
        case ")":
        case ">":
          --depth;
          break;
        case sep:
          if (depth === 0) {
            list.push(subparser(input.slice(start, i)));
            start = i + 1;
          }
          break;
      }
    }

    if (depth !== 0) {
      this.throwError("unbalanced parenthesis");
    }
    list.push(subparser(input.slice(start)));
    return list;
  }

  private parseAtom(input: string): Pattern {
    input = input.trim();
    switch (true) {
      case input.startsWith("("): { // sub-pattern
        return this.parsePattern(input.slice(1, -1));
      }
      case input === "<_KEY>": { // cert name
        return new CertNamePattern();
      }
      case input.startsWith("<_"): { // variable
        const id = input.slice(2, -1);
        return new VariablePattern(id);
      }
      case input.startsWith("<"): { // reference
        const id = input.slice(1, -1);
        return this.schema.getPattern(id);
      }
      default: { // constant
        return new ConstPattern(`/${input}`);
      }
    }
  }

  public addRules(line: string): void {
    const ids = line.split("<=").map((token) => token.trim());
    for (let i = ids.length - 1; i > 0; --i) {
      const signerId = ids[i]!;
      const packetId = ids[i - 1]!;
      this.schema.addRule(packetId, signerId);
    }
  }

  private throwError(message: string): never {
    throw new Error(`${message} @line${this.lineNum}`);
  }
}

/**
 * Load policy from VerSec syntax.
 * https://pollere.net/Pdfdocs/BuildingBridge.pdf page 14
 */
export function load(input: string): TrustSchemaPolicy {
  const parser = new Parser();
  for (let line of input.split("\n")) {
    ++parser.lineNum;
    line = line.trim();
    switch (true) {
      case line === "": // blank
      case /^\s*#/.test(line): // comment
        break;
      case line.includes("<="):
        parser.addRules(line);
        break;
      case line.includes("="):
        parser.addPattern(line);
        break;
    }
  }
  return parser.schema;
}

function printPattern(p: Pattern): string {
  if (p instanceof ConstPattern) {
    return p.name.toString().slice(1);
  }
  if (p instanceof VariablePattern) {
    return `<_${p.id}${
      p.inner ? `!inner:${p.inner.constructor.name}` : ""}${
      p.filter ? `!filter:${p.filter.constructor.name}` : ""}>`;
  }
  if (p instanceof CertNamePattern) {
    return "<_KEY>";
  }
  if (p instanceof ConcatPattern) {
    return printSequence(p.parts, "/", [ConcatPattern, AlternatePattern]);
  }
  if (p instanceof AlternatePattern) {
    return printSequence(p.choices, "|", [AlternatePattern]);
  }
  return `<!${p.constructor.name}>`;
}

function printSequence(list: Pattern[], sep: string, parenTypes: Array<typeof Pattern>): string {
  return list.map((p) => {
    let needParens = false;
    for (const ctor of parenTypes) {
      needParens ||= p instanceof ctor;
    }
    return needParens ? `(${printPattern(p)})` : printPattern(p);
  }).join(sep);
}

/**
 * Print policy to VerSec syntax.
 * https://pollere.net/Pdfdocs/BuildingBridge.pdf page 14
 */
export function print(policy: TrustSchemaPolicy): string {
  const lines: string[] = [];
  for (const [id, p] of policy.listPatterns()) {
    lines.push(`${id} = ${printPattern(p)}`);
  }
  for (const [packet, signer] of policy.listRules()) {
    lines.push(`${packet} <= ${signer}`);
  }
  return lines.join("\n");
}
