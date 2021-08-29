import type { Component as ndnComponent } from "@ndn/packet";
import assert from "minimalistic-assert";

import * as N from "./nest";
import * as T from "./token";

/** AST node. */
export abstract class Node {
  public abstract toTokens(): Iterable<T.Token>;
}

/** Expression node. */
export abstract class Expr extends Node {
  public override toTokens() {
    return Expr.exprToTokens(this);
  }

  protected static *exprToTokens(node: Expr, parent?: Expr) {
    const parens = parent && node.exprParens(parent);
    if (parens) {
      yield new T.ParenL();
    }
    yield* node.exprToTokens();
    if (parens) {
      yield new T.ParenR();
    }
  }

  protected abstract exprParens(parent: Expr): boolean;
  protected abstract exprToTokens(): Iterable<T.Token>;
}

/** Name component literal node. */
export class ComponentLit extends Expr {
  constructor(public comp: ndnComponent) {
    super();
  }

  protected override exprParens() {
    return false;
  }

  protected override *exprToTokens() {
    yield new T.ComponentLit(this.comp);
  }
}

/** Identifier node. */
export class Ident extends Expr {
  /** Determine whether identifier could be a runtime variable name. */
  public static isRuntime(id: string): boolean {
    return !id.startsWith("_");
  }

  public static fromToken(token: N.Unit): Ident {
    assert(token instanceof T.Ident);
    return new Ident(token.id);
  }

  constructor(public id: string) {
    super();
  }

  protected override exprParens() {
    return false;
  }

  protected override *exprToTokens() {
    yield new T.Ident(this.id);
  }
}

/** Internal function call node. */
export class Call extends Expr {
  constructor(public func: string, public args: Expr[] = []) {
    super();
  }

  protected override exprParens() {
    return false;
  }

  protected override *exprToTokens() {
    yield new T.Ident(this.func);
    yield new T.ParenL();
    for (const [i, arg] of this.args.entries()) {
      if (i > 0) {
        yield new T.Comma();
      }
      yield* arg.toTokens();
    }
    yield new T.ParenR();
  }
}

/** Alternate expressions or expression in parens node. */
export class Alt extends Expr {
  constructor(public choices: Expr[] = []) {
    super();
  }

  protected override exprParens(parent: Expr) {
    return !(parent instanceof Alt);
  }

  protected override *exprToTokens(): Iterable<T.Token> {
    for (const [i, choice] of this.choices.entries()) {
      if (i > 0) {
        yield new T.Or();
      }
      yield* Expr.exprToTokens(choice, this);
    }
  }
}

/** Name node. */
export class Name extends Expr {
  constructor(public comps: Expr[] = []) {
    super();
  }

  protected override exprParens(parent: Expr) {
    return !(parent instanceof Name || parent instanceof Constrained || this.comps.length === 1);
  }

  protected override *exprToTokens(): Iterable<T.Token> {
    for (const [i, comp] of this.comps.entries()) {
      if (i > 0) {
        yield new T.Slash();
      }
      yield* Expr.exprToTokens(comp, this);
    }
  }
}

/** Constrained expression node. */
export class Constrained extends Expr {
  constructor(
      public name: Name | Ident,
      public componentConstraint: ComponentConstraintEq,
  ) {
    super();
  }

  protected override exprParens() {
    return true;
  }

  protected override *exprToTokens(): Iterable<T.Token> {
    yield* Expr.exprToTokens(this.name, this);
    if (this.componentConstraint) {
      yield new T.And();
      yield* this.componentConstraint.toTokens();
    }
  }
}

/** Component constraint equation. */
export abstract class ComponentConstraintEq extends Node {
  public override toTokens() {
    return this.componentConstraintToTokens("&");
  }

  protected static componentConstraintToTokens(node: ComponentConstraintEq, parentOp: string) {
    return node.componentConstraintToTokens(parentOp);
  }

  protected abstract componentConstraintToTokens(parentOp: string): Iterable<T.Token>;
}

/** Component constraint term node. */
export class ComponentConstraintTerm extends Node {
  constructor(public tag: Ident, public expr: Expr) {
    super();
  }

  public override *toTokens() {
    yield* this.tag.toTokens();
    yield new T.Colon();
    yield* this.expr.toTokens();
  }
}

/** Component constraint node. */
export class ComponentConstraint extends ComponentConstraintEq {
  constructor(public terms: ComponentConstraintTerm[] = []) {
    super();
  }

  protected override *componentConstraintToTokens() {
    yield new T.BraceL();
    for (const [i, term] of this.terms.entries()) {
      if (i > 0) {
        yield new T.Comma();
      }
      yield* term.toTokens();
    }
    yield new T.BraceR();
  }
}

/** Component constraint And/Or relation node. */
export class ComponentConstraintRel extends ComponentConstraintEq {
  constructor(public left: ComponentConstraintEq, public op: T.Operator, public right: ComponentConstraintEq) {
    super();
  }

  protected override *componentConstraintToTokens(parentOp: string) {
    if (parentOp !== this.op.operator) {
      yield new T.ParenL();
    }
    yield* ComponentConstraintEq.componentConstraintToTokens(this.left, this.op.operator);
    yield this.op;
    yield* ComponentConstraintEq.componentConstraintToTokens(this.right, this.op.operator);
    if (parentOp !== this.op.operator) {
      yield new T.ParenR();
    }
  }
}

/** Signing constraint node. */
export class SigningConstraint extends Node {
  constructor(public signers: Ident[] = []) {
    super();
  }

  public override *toTokens() {
    yield new T.ArrowL();
    for (const [i, ident] of this.signers.entries()) {
      if (i > 0) {
        yield new T.Or();
      }
      yield* ident.toTokens();
    }
  }
}

/** Statement node. */
export class Stmt extends Node {
  constructor(
      public ident: Ident,
      public definition: Expr | undefined = undefined,
      public signingChain: SigningConstraint[] = [],
  ) {
    super();
  }

  public override *toTokens() {
    yield* this.ident.toTokens();
    if (this.definition) {
      yield new T.Colon();
      yield* this.definition.toTokens();
    }
    for (const sc of this.signingChain) {
      yield* sc.toTokens();
    }
  }
}

/** Schema document node. */
export class Schema extends Node {
  constructor(public stmts: Stmt[] = []) {
    super();
  }

  public override *toTokens() {
    for (const stmt of this.stmts) {
      yield* stmt.toTokens();
      yield new T.Comma();
    }
  }
}

/** Parse a schema. */
export function parse(tokens: Iterable<T.Token>): Schema {
  return new Schema(
    N.split(T.Comma, N.scan(tokens), true).map(parseStmt),
  );
}

function throwParseError(msg: string, units: readonly N.Unit[] = []): never {
  const tokens = Array.from(N.toTokens(...units));
  throw new Error(`${msg} @${T.Position.from(tokens)} ${tokens.join("")}`);
}

function parseStmt(units: readonly N.Unit[]): Stmt {
  const [idu, ...su] = N.split(T.ArrowL, units);
  const [ident, colon, ...du] = idu!;
  if (!(ident instanceof T.Ident)) {
    throwParseError("statement must start with ident", idu);
  }
  const stmt = new Stmt(Ident.fromToken(ident));
  if (colon) {
    if (!(colon instanceof T.Colon) || du.length === 0) {
      throwParseError("invalid definition", idu);
    }
    stmt.definition = parseExpr(du);
  }
  stmt.signingChain = su.map(parseSigningConstraint);
  return stmt;
}

function parseExpr(units: readonly N.Unit[]): Expr {
  units = N.unParen(units);
  const nu: N.Unit[] = [];
  const cu = [...units];
  while (cu.length > 0) {
    const u = cu.shift()!;
    if (u instanceof T.And) {
      break;
    }
    nu.push(u);
  }

  if (nu.length === 0) {
    throwParseError("expression must have name", units);
  }
  const name = parseName(nu);
  if (cu.length === 0) {
    if (name.comps.length === 1) {
      return name.comps[0]!;
    }
    return name;
  }

  return new Constrained(
    name.comps.length === 1 && name.comps[0] instanceof Ident ? name.comps[0] : name,
    parseComponentConstraintEq(cu),
  );
}

function parseName(units: readonly N.Unit[]): Name {
  units = N.unParen(units);
  return new Name(
    N.split(T.Slash, units, true).map(parseComponent),
  );
}

function parseComponent(units: readonly N.Unit[]): Expr {
  units = N.unParen(units);
  const alts = N.split(T.Or, units);
  if (alts.length > 1) {
    return new Alt(
      alts.map(parseExpr),
    );
  }

  if (units.length === 2 && units[0] instanceof T.Ident && units[1] instanceof N.Paren) {
    return new Call(
      units[0].id,
      N.split(T.Comma, units[1].mid, true).map(parseExpr),
    );
  }

  if (units.length !== 1) {
    throwParseError("component should have one token", units);
  }

  const u = units[0]!;
  if (u instanceof T.ComponentLit) {
    return new ComponentLit(u.comp);
  }
  if (u instanceof T.Ident) {
    return Ident.fromToken(u);
  }
  throwParseError("unexpected token for component", units);
}

function parseComponentConstraintEq(units: readonly N.Unit[]): ComponentConstraintEq {
  units = N.unParen(units);
  if (units.length === 1 && units[0] instanceof N.Brace) {
    return parseComponentConstraint(units[0]);
  }
  if (units.length > 2) {
    const op = units[units.length - 2]!;
    if (op instanceof T.And || op instanceof T.Or) {
      return new ComponentConstraintRel(
        parseComponentConstraintEq(units.slice(0, -2)),
        op,
        parseComponentConstraintEq(units.slice(-1)),
      );
    }
  }
  throwParseError("invalid component constraint equation", units);
}

function parseComponentConstraint(brace: N.Brace): ComponentConstraint {
  return new ComponentConstraint(
    N.split(T.Comma, brace.mid, true).map(parseComponentConstraintTerm),
  );
}

function parseComponentConstraintTerm(units: readonly N.Unit[]): ComponentConstraintTerm {
  const kv = N.split(T.Colon, units);
  if (kv.length !== 2 || kv[0]!.length !== 1 || !(kv[0]![0] instanceof T.Ident)) {
    throwParseError("invalid component constraint term", units);
  }
  return new ComponentConstraintTerm(Ident.fromToken(kv[0]![0]!), parseExpr(kv[1]!));
}

function parseSigningConstraint(units: readonly N.Unit[]): SigningConstraint {
  const signers = N.split(T.Or, units).map((sub) => {
    if (sub.length !== 1 || !(sub[0] instanceof T.Ident)) {
      throwParseError("invalid signing constraint", units);
    }
    return Ident.fromToken(sub[0]);
  });
  return new SigningConstraint(signers);
}
