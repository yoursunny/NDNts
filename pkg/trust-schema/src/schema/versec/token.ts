import { Component } from "@ndn/packet";

/** Position in schema document. */
export class Position {
  /**
   * Constructor
   * @param line - 0-based line number.
   * @param column - 0-based column number.
   */
  constructor(line?: number, column?: number) {
    this.line = typeof line === "number" ? 1 + line : undefined;
    this.column = typeof column === "number" ? 1 + column : undefined;
  }

  /** 1-based line number, if known. */
  public readonly line?: number;
  /** 1-based column number, if known. */
  public readonly column?: number;

  public toString(): string {
    return `${this.line ?? "?"}:${this.column ?? "?"}`;
  }
}
export namespace Position {
  export const UNKNOWN = new Position();

  export interface WithPosition {
    position?: Position;
  }

  /** Extract first valid position from a sequence. */
  export function from(input?: WithPosition | Iterable<WithPosition>): Position {
    if (!input) {
      return UNKNOWN;
    }
    if ((input as WithPosition).position?.line) {
      return (input as WithPosition).position!;
    }
    if (typeof (input as Iterable<WithPosition>)[Symbol.iterator] === "function") {
      for (const obj of (input as Iterable<WithPosition>)) {
        if (obj.position?.line) {
          return obj.position;
        }
      }
    }
    return UNKNOWN;
  }
}

/** Token in schema document. */
export abstract class Token {
  /** Token position. */
  public position = Position.UNKNOWN;

  /** String representation of the token. */
  public abstract toString(): string;
}

/** Operator token. */
export abstract class Operator extends Token {
  /** Operator short string. */
  public abstract get operator(): string;

  /** Operator nesting level. */
  public abstract get nest(): number;

  /** If true, when this token appears at end of line, a comma should be inserted. */
  public abstract get autoCommaAfter(): boolean;
}

function declareOperator(className: string, opPretty: string, autoCommaAfter: boolean, nest = 0) {
  const op = opPretty.trim();
  const klass = {
    [className]: class extends Operator {
      public override get operator() { return op; }
      public override get nest() { return nest; }
      public override get autoCommaAfter() { return autoCommaAfter; }
      public override toString() { return opPretty; }
    },
  };
  OPERATORS[op] = klass[className]!;
  return OPERATORS[op];
}

const OPERATORS: Record<string, new() => Operator> = {};
const RE_OPERATOR = /^([,:&|/(){}]|<=)/;

export const Comma = declareOperator("Comma", ", ", false);
export const Colon = declareOperator("Colon", ": ", false);
export const And = declareOperator("And", " & ", false);
export const Or = declareOperator("Or", " | ", false);
export const ArrowL = declareOperator("ArrowL", " <= ", false);
export const Slash = declareOperator("Slash", "/", false);
export const ParenL = declareOperator("ParenL", "(", false, 1);
export const ParenR = declareOperator("ParenR", ")", true, -1);
export const BraceL = declareOperator("BraceL", "{ ", false, 1);
export const BraceR = declareOperator("BraceR", " }", true, -1);

/** Identifier token. */
export class Ident extends Token {
  constructor(public readonly id: string) {
    super();
  }

  public override toString() { return this.id; }
}

const RE_IDENT = /^([a-z_#$]\w*)/i;

/** Name component literal token. */
export class ComponentLit extends Token {
  constructor(public readonly comp: Component) {
    super();
  }

  public override toString() { return `"${this.comp.toString()}"`; }
}

/** Tokenize a schema document. */
export function* scan(doc: string): Iterable<Token> {
  for (const [lineNum, line] of doc.split("\n").entries()) {
    const tokens = Array.from(scanLine(line, lineNum));
    if (tokens.length === 0) {
      continue;
    }

    const lastToken = tokens.at(-1)!;
    if (!(lastToken instanceof Operator) || lastToken.autoCommaAfter) {
      const comma = new Comma();
      comma.position = new Position(lineNum, line.length);
      tokens.push(comma);
    }
    yield* tokens;
  }
}

function* scanLine(line: string, lineNum: number): Iterable<Token> {
  line = line.trimEnd();
  let column = 0;
  const skipWhitespace = () => {
    const prevLen = line.length;
    line = line.trimStart();
    column += prevLen - line.length;
  };
  const skipChars = (count: number) => {
    line = line.slice(count);
    column += count;
  };
  const makePosition = () => new Position(lineNum, column);
  const withPosition = (token: Token): Token => {
    token.position = makePosition();
    return token;
  };
  const throwScanError = (msg: string) => {
    throw new Error(`${msg} @${makePosition()} ${line}`);
  };

  // eslint-disable-next-line no-unmodified-loop-condition
  for (skipWhitespace(); line !== ""; skipWhitespace()) {
    let mOperator: RegExpExecArray | null | undefined;
    let mIdent: RegExpExecArray | null | undefined;
    switch (true) {
      case line.startsWith("//"): {
        return;
      }
      case line.startsWith("\""): {
        const pos = line.indexOf("\"", 1);
        if (pos < 0) {
          throwScanError("unterminated literal");
        }
        const comp = Component.from(line.slice(1, pos));
        yield withPosition(new ComponentLit(comp));
        skipChars(pos + 1);
        break;
      }
      case !!(mOperator = RE_OPERATOR.exec(line)): {
        const op = mOperator[1]!;
        yield withPosition(new OPERATORS[op]!());
        skipChars(op.length);
        break;
      }
      case !!(mIdent = RE_IDENT.exec(line)): {
        const id = mIdent[1]!;
        yield withPosition(new Ident(id));
        skipChars(id.length);
        break;
      }
      default: {
        throwScanError("unrecognized input");
      }
    }
  }
}

/** Serialize a token stream. */
export function print(tokens: Iterable<Token>): string {
  const s = [];
  let depth = 0;
  for (const token of tokens) {
    s.push(token.toString());
    if (token instanceof Operator) {
      depth += token.nest;
      if (token instanceof Comma && depth === 0) {
        s.splice(-1, 1, "\n");
      }
    }
  }
  return s.join("");
}
