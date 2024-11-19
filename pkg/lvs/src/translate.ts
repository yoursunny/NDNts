import { type Component, Name } from "@ndn/packet";
import { pattern as P, type printESM, TrustSchemaPolicy } from "@ndn/trust-schema";
import { assert } from "@ndn/util";
import DefaultMap from "mnemonist/default-map.js";

import { type ConsOption, type Constraint, type LvsModel, type Node, type PatternEdge, type UserFnCall, ValueEdge } from "./tlv";

export type UserFn = (value: Component, args: readonly Component[]) => boolean;
export type Vtable = ReadonlyMap<string, UserFn>;
export type VtableInput = Vtable | Record<string, UserFn>;

/**
 * Translate LVS model to TrustSchemaPolicy.
 * @param model - LVS model.
 * @param vtable - User functions.
 * @returns Executable policy.
 *
 * @throws Error
 * Malformed LVS model.
 * Missing user functions.
 */
export function toPolicy(model: LvsModel, vtable?: VtableInput): TrustSchemaPolicy;

/**
 * Translate LVS model to TrustSchemaPolicy without linking user functions.
 * @param model - LVS model.
 * @param forPrint - {@link toPolicy.forPrint} symbol.
 *
 * @returns Possibly incomplete policy.
 * If the LVS model references user functions, the policy will not execute successfully.
 * The policy can be serialized with {@link printESM} and {@link printUserFns}.
 */
export function toPolicy(model: LvsModel, forPrint: typeof toPolicy.forPrint): TrustSchemaPolicy;

export function toPolicy(model: LvsModel, arg2: VtableInput | typeof toPolicy.forPrint = {}): TrustSchemaPolicy {
  const vtable: Vtable = arg2 instanceof Map ? arg2 :
    new Map(arg2 === toPolicy.forPrint ? [] : Object.entries(arg2));
  const translator = new Translator(model, vtable);
  translator.translate();
  if (arg2 !== toPolicy.forPrint) {
    const { missingFns } = translator;
    if (missingFns.length > 0) {
      throw new Error(`missing user functions: ${missingFns.join(" ")}`);
    }
  }
  return translator.policy;
}
export namespace toPolicy {
  export const forPrint = Symbol("@ndn/lvs#toPolicy.forPrint");
}

export const neededFnsMap = new WeakMap<TrustSchemaPolicy, ReadonlyMap<string, ReadonlySet<number>>>();

class Translator {
  constructor(
      private readonly model: LvsModel,
      private readonly vtable: Vtable,
  ) {
    neededFnsMap.set(this.policy, this.neededFns);
  }

  public readonly policy = new TrustSchemaPolicy();

  public get missingFns(): string[] {
    return Array.from(this.neededFns.keys()).filter((fn) => !this.vtable.get(fn));
  }

  private readonly tagSymbols = new Map<number, string>();
  private readonly patternNames = new Map<string, number>();
  private readonly wantedNodes = new Set<number>();
  private readonly neededFns = new DefaultMap<string, Set<number>>(() => new Set<number>());
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
    const names: string[] = [];
    for (const name of node.ruleNames) {
      const used = this.patternNames.get(name);
      if (used === undefined) {
        this.patternNames.set(name, node.id);
      } else if (used !== node.id) {
        continue;
      }
      names.push(name);
    }

    if (names.length === 0) {
      return [`_NODE_${node.id}`];
    }
    return names;
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
    this.neededFns.get(call.fn).add(call.args.length);
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

  public printESM(ctx: printESM.Context): string {
    const { indent, imports } = ctx;
    imports.get("./lvsuserfns.mjs").add("* as lvsUserFns");

    const lines: string[] = [
      `${indent}{`,
      `${indent}  accept(name, vars) {`,
      `${indent}    const args = [`,
    ];
    for (const b of this.binds) {
      if (typeof b === "string") {
        lines.push(`${indent}      vars.get(${JSON.stringify(b)})?.get(0),`);
      } else {
        imports.get("@ndn/packet").add("Component");
        lines.push(`${indent}      Component.from(${JSON.stringify(b.toString())}),`);
      }
    }
    lines.push(`${indent}    ];`);
    if (this.binds.length > 0) {
      lines.push(`${indent}    void vars;`);
    }
    lines.push(
      `${indent}    return args.every(a => !!a) && lvsUserFns.${this.fn}(name.at(0), args);`,
      `${indent}  }`,
      `${indent}}`,
    );
    return lines.join("\n");
  }
}
