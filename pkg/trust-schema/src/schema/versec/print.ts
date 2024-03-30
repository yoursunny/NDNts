import { CertNaming } from "@ndn/keychain";
import { assert } from "@ndn/util";
import DefaultMap from "mnemonist/default-map.js";

import { AlternatePattern, CertNamePattern, ConcatPattern, ConstPattern, type Pattern, VariablePattern } from "../pattern";
import type { TrustSchemaPolicy } from "../policy";
import * as A from "./ast";
import * as F from "./filter";
import * as T from "./token";

class PrintPatternCtx {
  public readonly filters = new DefaultMap<string, VariablePattern.Filter[]>(() => []);
}

class Printer {
  public readonly schema = new A.Schema();
  private savedPatterns = new Set<string>();

  public processPattern(id: string, p: Pattern): void {
    if (this.savedPatterns.has(id)) {
      return;
    }
    this.savedPatterns.add(id);

    const ident = new A.Ident(id);
    const ctx = new PrintPatternCtx();
    const def = this.translatePattern(p, ctx);
    let cc: A.ComponentConstraintEq | undefined;
    for (const [id, filters] of ctx.filters) {
      const filter = F.combine(...filters);
      assert(filter);
      const fcc = this.translateFilter(filter, new A.Ident(id));
      cc = cc ? new A.ComponentConstraintRel(cc, new T.And(), fcc) : fcc;
    }
    this.schema.stmts.push(new A.Stmt(ident, def, cc));
  }

  private translatePattern(p: Pattern, ctx: PrintPatternCtx): A.Expr {
    if (p instanceof ConstPattern) {
      return this.translateConstPattern(p);
    }
    if (p instanceof VariablePattern) {
      return this.translateVariablePattern(p, ctx);
    }
    if (p instanceof CertNamePattern) {
      return this.translateCertNamePattern(p);
    }
    if (p instanceof ConcatPattern) {
      return this.translateConcatPattern(p, ctx);
    }
    if (p instanceof AlternatePattern) {
      return this.translateAlternatePattern(p, ctx);
    }
    return new A.Ident(`!${p.constructor.name}`);
  }

  private translateConstPattern(p: ConstPattern): A.Expr {
    return new A.Name(
      p.name.comps.map((comp) => new A.ComponentLit(comp)),
    );
  }

  private translateVariablePattern(p: VariablePattern, ctx: PrintPatternCtx): A.Expr {
    const ident = new A.Ident(p.id);
    let name: A.Name | A.Ident = ident;
    if (p.inner) {
      const inner = this.translatePattern(p.inner, ctx);
      if (inner instanceof A.Name || inner instanceof A.Ident) {
        name = inner;
      } else {
        name = new A.Name([inner]);
      }
    }

    if (p.filter === undefined) {
      return name;
    }
    if (!A.Ident.isRuntime(p.id) && p.filter instanceof F.FunctionFilter) {
      return p.filter.callExpr;
    }
    ctx.filters.get(p.id).push(p.filter);
    return name;
  }

  private translateCertNamePattern(p: CertNamePattern): A.Expr {
    void p;
    return new A.Name([
      new A.ComponentLit(CertNaming.KEY),
      new A.Ident("_"),
      new A.Ident("_"),
      new A.Ident("_"),
    ]);
  }

  private translateConcatPattern(p: ConcatPattern, ctx: PrintPatternCtx): A.Expr {
    return new A.Name(
      p.parts.map((part) => this.translatePattern(part, ctx)),
    );
  }

  private translateAlternatePattern(p: AlternatePattern, ctx: PrintPatternCtx): A.Expr {
    return new A.Alt(
      p.choices.map((choice) => this.translatePattern(choice, ctx)),
    );
  }

  private translateFilter(f: VariablePattern.Filter, parentIdent: A.Ident): A.ComponentConstraintEq {
    if (f instanceof F.FunctionFilter) {
      return new A.ComponentConstraint([
        new A.ComponentConstraintTerm(parentIdent, f.callExpr),
      ]);
    }

    if (f instanceof F.ConstraintTerm) {
      const ctx = new PrintPatternCtx();
      const cc = new A.ComponentConstraint([
        new A.ComponentConstraintTerm(new A.Ident(f.id), this.translatePattern(f.pattern, ctx)),
      ]);
      if (ctx.filters.size > 0) {
        cc.terms.push(new A.ComponentConstraintTerm(new A.Ident("!ctx"),
          new A.Ident(Array.from(ctx.filters.keys()).join(","))));
      }
      return cc;
    }

    if (f instanceof F.And || f instanceof F.Or) {
      const op = f instanceof F.And ? new T.And() : new T.Or();
      return f.filters.map((sub) => this.translateFilter(sub, parentIdent))
        .reduce((left, right) => new A.ComponentConstraintRel(left, op, right));
    }

    return new A.ComponentConstraint([
      new A.ComponentConstraintTerm(new A.Ident("!filter"), new A.Ident(f.constructor.name)),
    ]);
  }

  public processRule(packet: string, signer: string): void {
    this.schema.stmts.push(new A.Stmt(
      new A.Ident(packet),
      undefined,
      undefined,
      [new A.SigningConstraint([new A.Ident(signer)])],
    ));
  }
}

/** Print policy to VerSec syntax. */
export function print(policy: TrustSchemaPolicy): string {
  const d = new Printer();
  for (const [id, p] of policy.listPatterns()) {
    d.processPattern(id, p);
  }
  for (const [packet, signer] of policy.listRules()) {
    d.processRule(packet, signer);
  }
  return T.print(d.schema.toTokens());
}
