import { type Component, Name } from "@ndn/packet";
import { pattern as P, type printESM, TrustSchemaPolicy } from "@ndn/trust-schema";
import { assert } from "@ndn/util";

import { type ConsOption, type Constraint, type LvsModel, type Node, type PatternEdge, type UserFnCall, ValueEdge } from "./tlv";

export function toPolicy(model: LvsModel, vtable: VtableInput = {}): TrustSchemaPolicy {
  vtable = vtable instanceof Map ? vtable : new Map(Object.entries(vtable));
  const translator = new Translator(model, vtable);
  translator.translate();
  return translator.policy;
}

export type UserFn = (value: Component, args: readonly Component[]) => boolean;
export type Vtable = ReadonlyMap<string, UserFn>;
export type VtableInput = Vtable | Record<string, UserFn>;

class Translator {
  constructor(
      private readonly model: LvsModel,
      private readonly vtable: Vtable,
  ) {}

  public readonly policy = new TrustSchemaPolicy();
  private readonly tagSymbols = new Map<number, string>();
  private readonly wantedNodes = new Set<number>();
  public readonly neededFns = new Set<string>();
  private lastAutoId = 0;

  public translate(): void {
    this.gatherTagSymbols();
    this.gatherNodes();
    this.processPatterns();
    this.processRules();
  }

  private gatherTagSymbols(): void {
    this.tagSymbols.clear();
    for (const { tag, identifier } of this.model.tagSymbols) {
      this.tagSymbols.set(tag, identifier);
    }
  }

  private nameTag(tag: number): string {
    return this.tagSymbols.get(tag) ?? `_TAG_${tag}`;
  }

  private gatherNodes(): void {
    this.wantedNodes.clear();
    for (const node of this.model.nodes) {
      if (node.ruleNames.length > 0 || node.signConstraints.length > 0) {
        this.wantedNodes.add(node.id);
      }
      for (const sc of node.signConstraints) {
        this.wantedNodes.add(sc);
      }
    }
  }

  private processPatterns(): void {
    for (const id of this.wantedNodes) {
      const node = this.model.nodes[id]!;
      const pattern = this.trPattern(node).simplify();
      for (const name of this.namePattern(node)) {
        this.policy.addPattern(name, pattern);
      }
    }
  }

  private namePattern(node: Node): string[] {
    if (node.ruleNames.length === 0) {
      return [`_NODE_${node.id}`];
    }
    return node.ruleNames;
  }

  private trPattern(node: Node): P.Pattern {
    const parts: P.Pattern[] = [];
    while (node.parent !== undefined) {
      const parent = this.model.nodes[node.parent]!;
      const edge = parent.findEdgeTo(node.id)!;
      parts.unshift(this.trEdge(edge));
      node = parent;
    }
    return new P.ConcatPattern(parts);
  }

  private trEdge(edge: ValueEdge | PatternEdge): P.Pattern {
    if (edge instanceof ValueEdge) {
      return this.trValue(edge.value);
    }

    return new P.OverlapPattern([
      new P.VariablePattern(this.nameTag(edge.tag)),
      ...edge.constraints.map((cons) => this.trConstraint(cons)),
    ]);
  }

  private trConstraint(cons: Constraint): P.Pattern {
    return new P.AlternatePattern(
      Array.from(cons.options, (co) => this.trConsOption(co)),
    );
  }

  private trConsOption(co: ConsOption): P.Pattern {
    if (co.value) {
      return this.trValue(co.value);
    }

    if (co.tag) {
      return new P.VariablePattern(this.nameTag(co.tag));
    }

    assert(co.call);
    return new P.VariablePattern(`_FN_${++this.lastAutoId}`, {
      filter: this.trCall(co.call),
    });
  }

  private trValue(value: Component): P.Pattern {
    return new P.ConstPattern(new Name([value]));
  }

  private trCall(call: UserFnCall): P.VariablePattern.Filter {
    this.neededFns.add(call.fn);
    return new LvsFilter(this.vtable, call.fn, Array.from(call.args, (a) => {
      if (a.value !== undefined) {
        return a.value;
      }
      assert(a.tag !== undefined);
      return this.nameTag(a.tag);
    }));
  }

  private processRules(): void {
    for (const node of this.model.nodes) {
      const packetIds = this.namePattern(node);
      for (const sc of node.signConstraints) {
        const signerIds = this.namePattern(this.model.nodes[sc]!);

        for (const packetId of packetIds) {
          for (const signerId of signerIds) {
            this.policy.addRule(packetId, signerId);
          }
        }
      }
    }
  }
}

class LvsFilter implements P.VariablePattern.Filter, printESM.PrintableFilter {
  constructor(
      vtable: Vtable,
      private readonly fn: string,
      private readonly binds: Array<string | Component>,
  ) {
    this.func = vtable.get(fn);
  }

  private readonly func?: UserFn;

  public accept(name: Name, vars: P.Vars): boolean {
    let args: Array<Component | undefined>;
    return !!this.func &&
    (args = Array.from(this.binds,
      (b) => typeof b === "string" ? vars.get(b)?.get(0) : b)
    ).every((a) => !!a) &&
    this.func(name.at(0), args);
  }

  public printESM(indent: string): string {
    const lines: string[] = [];
    lines.push(`${indent}{`);
    lines.push(`${indent}  accept(name, vars) {`);
    lines.push(`${indent}    const args = [`);
    for (const b of this.binds) {
      if (typeof b === "string") {
        lines.push(`${indent}      vars.get(${JSON.stringify(b)})?.get(0),`);
      } else {
        lines.push(`${indent}      Component.from(${JSON.stringify(b.toString())}),`);
      }
    }
    lines.push(`${indent}    ];`);
    lines.push(`${indent}    return args.every(a => !!a) && lvsUserFns.${this.fn}(name.at(0), args);`);
    lines.push(`${indent}  }`);
    lines.push(`${indent}}`);
    return lines.join("\n");
  }
}
