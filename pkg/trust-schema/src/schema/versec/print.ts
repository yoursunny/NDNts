import { CertNaming } from "@ndn/keychain";

import { AlternatePattern, CertNamePattern, ConcatPattern, ConstPattern, type Pattern, VariablePattern } from "../pattern";
import type { TrustSchemaPolicy } from "../policy";
import * as A from "./ast";
import * as F from "./filter";
import * as T from "./token";

class Printer {
  public readonly schema = new A.Schema();
  private savedPatterns = new Set<string>();

  public processPattern(id: string, p: Pattern): void {
    if (this.savedPatterns.has(id)) {
      return;
    }
    this.savedPatterns.add(id);

    this.schema.stmts.push(new A.Stmt(
      new A.Ident(id),
      this.translatePattern(p),
    ));
  }

  private translatePattern(p: Pattern): A.Expr {
    if (p instanceof ConstPattern) {
      return this.translateConstPattern(p);
    }
    if (p instanceof VariablePattern) {
      return this.translateVariablePattern(p);
    }
    if (p instanceof CertNamePattern) {
      return this.translateCertNamePattern(p);
    }
    if (p instanceof ConcatPattern) {
      return this.translateConcatPattern(p);
    }
    if (p instanceof AlternatePattern) {
      return this.translateAlternatePattern(p);
    }
    return new A.Ident(`!${p.constructor.name}`);
  }

  private translateConstPattern(p: ConstPattern): A.Expr {
    return new A.Name(
      p.name.comps.map((comp) => new A.ComponentLit(comp)),
    );
  }

  private translateVariablePattern(p: VariablePattern): A.Expr {
    let name: A.Name | A.Ident = new A.Ident(p.id);
    if (p.inner) {
      const inner = this.translatePattern(p.inner);
      if (inner instanceof A.Name || inner instanceof A.Ident) {
        name = inner;
      } else {
        name = new A.Name([inner]);
      }
    }

    switch (p.filter) {
      case undefined: {
        return name;
      }
      case F.timestamp: {
        return new A.Call("timestamp");
      }
      case F.seq: {
        return new A.Call("seq");
      }
    }
    return new A.Constrained(name, this.translateFilter(p.filter));
  }

  private translateFilter(f: VariablePattern.Filter): A.ComponentConstraintEq {
    if (f instanceof F.ConstraintTerm) {
      return new A.ComponentConstraint([
        new A.ComponentConstraintTerm(new A.Ident(f.id), this.translatePattern(f.pattern)),
      ]);
    }
    if (f instanceof F.And || f instanceof F.Or) {
      const op = f instanceof F.And ? new T.And() : new T.Or();
      return f.filters.map((sub) => this.translateFilter(sub))
        .reduce((left, right) => new A.ComponentConstraintRel(left, op, right));
    }
    return new A.ComponentConstraint([
      new A.ComponentConstraintTerm(new A.Ident("!filter"), new A.Ident(f.constructor.name)),
    ]);
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

  private translateConcatPattern(p: ConcatPattern): A.Expr {
    return new A.Name(
      p.parts.map((part) => this.translatePattern(part)),
    );
  }

  private translateAlternatePattern(p: AlternatePattern): A.Expr {
    return new A.Alt(
      p.choices.map((choice) => this.translatePattern(choice)),
    );
  }

  public processRule(packet: string, signer: string): void {
    this.schema.stmts.push(new A.Stmt(
      new A.Ident(packet),
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
