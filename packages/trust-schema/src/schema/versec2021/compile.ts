import { CertNaming } from "@ndn/keychain";
import { Name } from "@ndn/packet";
import assert from "minimalistic-assert";

import { AlternatePattern, CertNamePattern, ConcatPattern, ConstPattern, Pattern, VariablePattern } from "../pattern";
import { TrustSchemaPolicy } from "../policy";
import * as A from "./ast";
import * as F from "./filter";
import * as T from "./token";

function throwCompileError(msg: string, n: A.Node): never {
  const tokens = Array.from(n.toTokens());
  throw new Error(`${msg} @${T.Position.from(tokens)} ${
    tokens.length > 0 ? T.print(tokens) : n.constructor.name}`);
}

function findCertName(n: A.Name): number {
  if (n.comps.length < 4) {
    return -1;
  }
  for (let i = 4; i <= n.comps.length; ++i) {
    const [c0, c1, c2, c3] = n.comps.slice(i - 4, i);
    if (c0 instanceof A.ComponentLit && c0.comp.equals(CertNaming.KEY) &&
        c1 instanceof A.Ident && c1.id === "_" &&
        c2 instanceof A.Ident && c2.id === "_" &&
        c3 instanceof A.Ident && c3.id === "_") {
      return i - 4;
    }
  }
  return -1;
}

function isPatternConst(pattern: Pattern): boolean {
  if (pattern instanceof ConstPattern || pattern instanceof CertNamePattern) {
    return true;
  }
  if (pattern instanceof VariablePattern) {
    return pattern.inner ? isPatternConst(pattern.inner) : false;
  }
  if (pattern instanceof ConcatPattern) {
    return pattern.parts.every(isPatternConst);
  }
  if (pattern instanceof AlternatePattern) {
    return pattern.choices.every(isPatternConst);
  }
  /* istanbul ignore next */
  assert(false, `unexpected pattern type ${pattern.constructor.name}`);
}

function collectVariables(pattern: Pattern, ids = new Set<string>()): typeof ids {
  if (pattern instanceof VariablePattern) {
    if (!isPatternConst(pattern)) {
      ids.add(pattern.id);
    }
    if (pattern.inner) {
      collectVariables(pattern.inner, ids);
    }
  } else if (pattern instanceof ConcatPattern) {
    for (const p of pattern.parts) {
      collectVariables(p, ids);
    }
  } else if (pattern instanceof AlternatePattern) {
    for (const p of pattern.choices) {
      collectVariables(p, ids);
    }
  }
  return ids;
}

class CompilePatternCtx {
  /**
   * Constructor.
   * @param parentDefs parent definition IDs, for detecting cyclic dependencies.
   * @param filter constraints and replacements.
   * @param overridden terms overridden via replace() and cannot be changed in additional filters.
   */
  constructor(
      public readonly parentDefs: readonly string[],
      public readonly filter?: VariablePattern.Filter,
      public readonly overridden = new Set<string>(),
  ) {}

  /** Record a definition key, to prevent cyclic dependency. */
  public withDef(ident: A.Ident): CompilePatternCtx {
    const extended = [...this.parentDefs, ident.id];
    if (this.parentDefs.includes(ident.id)) {
      throwCompileError(`cyclic dependency ${extended.join("->")}`, ident);
    }
    return new CompilePatternCtx(extended, this.filter, this.overridden);
  }

  /**
   * Add a constraint or replacement.
   * @param f filter that represents the constraint or replacement.
   * @param overrideTerm new replacement term.
   */
  public andFilter(f: VariablePattern.Filter, overrideTerm?: string): CompilePatternCtx {
    return new CompilePatternCtx(this.parentDefs,
      ((f) => {
        if (this.filter && f) {
          return F.simplify(new F.And([this.filter, f]));
        }
        return this.filter ?? f;
      })(F.simplify(f, undefined, this.overridden)),
      overrideTerm ? new Set([...this.overridden, overrideTerm]) : this.overridden,
    );
  }
}

const AUTO_ID_PREFIX = "_AUTO_";

class Compiler {
  constructor(public readonly schema: A.Schema) {}

  public readonly policy = new TrustSchemaPolicy();
  private readonly defs = new Map<string, A.Expr>();
  private lastAutoId = 0;

  private makeAutoId(): string {
    return `${AUTO_ID_PREFIX}${++this.lastAutoId}`;
  }

  public processDefs(): void {
    for (const stmt of this.schema.stmts) {
      if (stmt.definition) {
        this.processDef(stmt.ident, stmt.definition);
      }
    }
  }

  private processDef(ident: A.Ident, definition: A.Expr): void {
    if (this.defs.has(ident.id)) {
      throwCompileError(`${ident.id} duplicate definition`, ident);
    }
    this.defs.set(ident.id, definition);
  }

  public processPatterns(): void {
    for (const [id, expr] of this.defs) {
      if (!A.Ident.isRuntime(id)) {
        continue;
      }
      const ctx = new CompilePatternCtx([id]);
      const pattern = this.makePattern(expr, ctx);
      this.policy.addPattern(id, pattern);
    }
  }

  private makePattern(expr: A.Expr, ctx: CompilePatternCtx): Pattern {
    const p = this.makePatternUnopt(expr, ctx).simplify();
    if (p instanceof VariablePattern && p.id.startsWith(AUTO_ID_PREFIX) && p.inner && !p.filter) {
      return p.inner;
    }
    return p;
  }

  private makePatternUnopt(expr: A.Expr, ctx: CompilePatternCtx): Pattern {
    if (expr instanceof A.ComponentLit) {
      return this.makePatternComponentLit(expr, ctx);
    }
    if (expr instanceof A.Ident) {
      return this.makePatternIdent(expr, ctx);
    }
    if (expr instanceof A.Call) {
      return this.makePatternCall(expr, ctx);
    }
    if (expr instanceof A.Alt) {
      return this.makePatternAlt(expr, ctx);
    }
    if (expr instanceof A.Name) {
      return this.makePatternName(expr, ctx);
    }
    if (expr instanceof A.Constrained) {
      return this.makePatternConstrained(expr, ctx);
    }
    /* istanbul ignore next */
    assert(false, `unexpected expression type ${expr.constructor.name}`);
  }

  private makePatternComponentLit(expr: A.ComponentLit, ctx: CompilePatternCtx): Pattern {
    void ctx;
    return new ConstPattern(new Name([expr.comp]));
  }

  private makePatternIdent(expr: A.Ident, ctx: CompilePatternCtx): Pattern {
    let inner: Pattern | undefined;
    if (ctx.filter) {
      const repl = F.reduceTerm(ctx.filter, expr.id);
      if (repl instanceof Pattern) {
        inner = repl;
      }
    }
    if (!inner) {
      const dep = this.defs.get(expr.id);
      if (dep) {
        inner = this.makePattern(dep, ctx.withDef(expr));
      }
    }

    if (!inner) {
      return new VariablePattern(expr.id);
    }
    if (!A.Ident.isRuntime(expr.id)) {
      return inner;
    }
    return new VariablePattern(expr.id, {
      minComps: 0,
      maxComps: Infinity,
      inner,
    });
  }

  private makePatternCall(expr: A.Call, ctx: CompilePatternCtx): Pattern {
    switch (expr.func.toLowerCase()) {
      case "timestamp": {
        if (expr.args.length > 0) {
          throwCompileError("timestamp() takes no arguments", expr);
        }
        return new VariablePattern(this.makeAutoId(), { filter: F.timestamp });
      }
      case "replace": {
        if (expr.args.length !== 3 || !(expr.args[1] instanceof A.Ident)) {
          throwCompileError("replace(input, find, repl) takes 3 arguments", expr);
        }
        const tag = expr.args[1].id;
        const repl = this.makePattern(expr.args[2]!, ctx);
        return this.makePattern(expr.args[0]!,
          ctx.andFilter(new F.ConstraintTerm(tag, repl), tag));
      }
      case "sysid": {
        if (expr.args.length > 0) {
          throwCompileError("sysid() takes no arguments", expr);
        }
        return new VariablePattern("SYSID");
      }
    }
    return new VariablePattern(`!call:${expr.func}`);
  }

  private makePatternAlt(expr: A.Alt, ctx: CompilePatternCtx): Pattern {
    return new AlternatePattern(
      expr.choices.map((choice) => this.makePattern(choice, ctx)),
    );
  }

  private makePatternName(expr: A.Name, ctx: CompilePatternCtx): Pattern {
    const patternFromComponents = (comps: readonly A.Expr[]) =>
      comps.map((comp) => this.makePattern(comp, ctx));
    const certNameIndex = findCertName(expr);
    if (certNameIndex >= 0) {
      return new ConcatPattern([
        ...patternFromComponents(expr.comps.slice(0, certNameIndex)),
        new CertNamePattern(),
        ...patternFromComponents(expr.comps.slice(certNameIndex + 4)),
      ]);
    }
    return new ConcatPattern(patternFromComponents(expr.comps));
  }

  private makePatternConstrained(expr: A.Constrained, ctx: CompilePatternCtx): Pattern {
    const filter = this.makeConstraintFilter(expr.componentConstraint, ctx);
    const inner = this.makePattern(expr.name, ctx.andFilter(filter));
    return new VariablePattern(this.makeAutoId(), {
      minComps: 0,
      maxComps: Infinity,
      inner,
      filter: F.simplify(filter, collectVariables(inner)),
    });
  }

  private makeConstraintFilter(cc: A.ComponentConstraintEq, ctx: CompilePatternCtx): VariablePattern.Filter {
    return F.simplify(this.makeConstraintFilterUnopt(cc, ctx));
  }

  private makeConstraintFilterUnopt(cc: A.ComponentConstraintEq, ctx: CompilePatternCtx): VariablePattern.Filter {
    let filters: VariablePattern.Filter[];
    let op = "&";
    if (cc instanceof A.ComponentConstraint) {
      filters = cc.terms.map((term) => this.makeConstraintTermFilter(term, ctx));
    } else if (cc instanceof A.ComponentConstraintRel) {
      filters = [
        this.makeConstraintFilter(cc.left, ctx),
        this.makeConstraintFilter(cc.right, ctx),
      ];
      if (cc.op instanceof T.Or) {
        op = "|";
      }
    } else {
      /* istanbul ignore next */
      assert(false, `unexpected component constraint type ${cc.constructor.name}`);
    }

    if (op === "|") {
      return new F.Or(filters);
    }
    return new F.And(filters);
  }

  private makeConstraintTermFilter(term: A.ComponentConstraintTerm, ctx: CompilePatternCtx): VariablePattern.Filter {
    const id = term.tag.id;
    const pattern = this.makePattern(term.expr, ctx);
    return new F.ConstraintTerm(id, pattern);
  }

  public processSigningChains(): void {
    for (const stmt of this.schema.stmts) {
      let packets = [stmt.ident];
      for (const sc of stmt.signingChain) {
        this.processSigningConstraint(packets, sc.signers);
        packets = sc.signers;
      }
    }
  }

  private processSigningConstraint(packets: readonly A.Ident[], signers: readonly A.Ident[]): void {
    for (const { id: packet } of packets) {
      for (const { id: signer } of signers) {
        this.policy.addRule(packet, signer);
      }
    }
  }
}

export function compile(schema: A.Schema): TrustSchemaPolicy {
  const c = new Compiler(schema);
  c.processDefs();
  c.processPatterns();
  c.processSigningChains();
  return c.policy;
}

export function load(input: string): TrustSchemaPolicy {
  const schema = A.parse(T.scan(input));
  return compile(schema);
}
