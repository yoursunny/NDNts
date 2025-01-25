import { type Component, Name } from "@ndn/packet";
import { pattern as P, type printESM, TrustSchemaPolicy } from "@ndn/trust-schema";
import { assert, getOrInsert } from "@ndn/util";

import { type ConsOption, type Constraint, type LvsModel, type Node, type PatternEdge, type UserFnCall, ValueEdge } from "./tlv";

/**
 * User function used by a LVS model.
 * @param value - Name component supplied at runtime.
 * @param args - Arguments defined in the LVS model.
 * @returns Whether `value` is a match.
 */
export type UserFn = (value: Component, args: readonly Component[]) => boolean;

/** A table of user functions. */
export type Vtable = ReadonlyMap<string, UserFn>;

/** A table of user functions. */
export type VtableInput = Vtable | Record<string, UserFn>;

/**
 * Translate LVS model to TrustSchemaPolicy.
 * @param model - LVS model.
 *
 * @throws Error
 * Malformed LVS model.
 * Some user functions referenced in the LVS model are missing in the vtable.
 */
export function toPolicy(model: LvsModel, {
  vtable = {},
  buildTime = false,
  patternAliases = false,
}: toPolicy.Options = {}): TrustSchemaPolicy {
  if (!(vtable instanceof Map)) {
    vtable = new Map(Object.entries(vtable));
  }
  const translator = new Translator(model, vtable, patternAliases);
  translator.translate();
  if (!buildTime) {
    const { missingFns } = translator;
    if (missingFns.length > 0) {
      throw new Error(`missing user functions: ${missingFns.join(" ")}`);
    }
  }
  return translator.policy;
}
export namespace toPolicy {
  /** {@link toPolicy} options. */
  export interface Options {
    /** Link user functions to the model. */
    vtable?: VtableInput;

    /**
     * If set to true, perform a build-time translation where incomplete vtable would not throw
     * an error. The returned policy may not executed successfully, but can be serialized with
     * {@link printESM} and {@link printUserFns}.
     *
     * Otherwise, perform a runtime translation that checks all referenced user functions are
     * present in the vtable.
     *
     * @defaultValue false
     */
    buildTime?: boolean;

    /**
     * LVS model allows a node to have multiple rule names and may associate the same rule name
     * with multiple nodes. However, TrustSchemaPolicy only allows one name for each pattern.
     *
     * If set to true, a pattern translated from a node is duplicated so that it is associated
     * with every rule name.
     *
     * Otherwise, each pattern is only reachable from one name. The rule name, if unique, will be
     * used; otherwise, an internal name is derived from the node id.
     *
     * @defaultValue false
     */
    patternAliases?: boolean;
  }
}

export const neededFnsMap = new WeakMap<TrustSchemaPolicy, Map<string, ReadonlySet<number>>>();

class Translator {
  constructor(
      private readonly model: LvsModel,
      private readonly vtable: Vtable,
      private readonly patternAliases: boolean,
  ) {
    neededFnsMap.set(this.policy, this.neededFns);
  }

  public readonly policy = new TrustSchemaPolicy();

  public get missingFns(): string[] {
    return Array.from(this.neededFns.keys()).filter((fn) => !this.vtable.get(fn));
  }

  private readonly tagSymbols = new Map<number, string>();
  private readonly ruleNames = new Map<string, number[]>();
  private readonly wantedNodes = new Set<number>();
  private readonly neededFns = new Map<string, Set<number>>();
  private lastAutoId = 0;

  public translate(): void {
    this.gatherTagSymbols();
    this.gatherNodes();
    this.processPatterns();
    this.processRules();
    if (this.patternAliases) {
      this.addAliases();
    }
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
        for (const rn of node.ruleNames) {
          getOrInsert(this.ruleNames, rn, () => []).push(node.id);
        }
      }
      for (const sc of node.signConstraints) {
        this.wantedNodes.add(sc);
      }
    }
  }

  private namePattern({ id, ruleNames }: Node): string[] {
    const names: string[] = [];
    for (const rn of ruleNames) {
      if (this.ruleNames.get(rn)?.length === 1) {
        names.push(rn);
        if (!this.patternAliases) {
          return names;
        }
      }
    }

    if (names.length === 0) {
      return [this.nameNodeId(id)];
    }
    return names;
  }

  private nameNodeId(id: number): string {
    return `_NODE_${id}`;
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
    getOrInsert(this.neededFns, call.fn, () => new Set()).add(call.args.length);
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

  private addAliases(): void {
    for (const [rn, ids] of this.ruleNames) {
      if (ids.length === 1) {
        continue;
      }
      this.policy.addPattern(rn, new P.AlternatePattern(
        ids.map((id) => this.policy.getPattern(this.nameNodeId(id))),
      ));
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
    const { indent, addImport } = ctx;
    addImport("./lvsuserfns.mjs", "* as lvsUserFns");

    const lines: string[] = [
      `${indent}{`,
      `${indent}  accept(name, vars) {`,
      `${indent}    const args = [`,
    ];
    for (const b of this.binds) {
      if (typeof b === "string") {
        lines.push(`${indent}      vars.get(${JSON.stringify(b)})?.get(0),`);
      } else {
        addImport("@ndn/packet", "Component");
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
