import { type Component, Name } from "@ndn/packet";
import { pattern as P, TrustSchemaPolicy } from "@ndn/trust-schema";
import { assert } from "@ndn/util";

import { type ConsOption, type Constraint, type LvsModel, type Node, type PatternEdge, ValueEdge } from "./tlv";

export function toPolicy(model: LvsModel): TrustSchemaPolicy {
  return new Translator(model).translate();
}

class Translator {
  constructor(private readonly model: LvsModel) {}

  private readonly policy = new TrustSchemaPolicy();
  private readonly tagSymbols = new Map<number, string>();
  private readonly wantedNodes = new Set<number>();
  private lastAutoId = 0;

  public translate(): TrustSchemaPolicy {
    this.gatherTagSymbols();
    this.gatherNodes();
    this.processPatterns();
    this.processRules();
    return this.policy;
  }

  private gatherTagSymbols(): void {
    this.tagSymbols.clear();
    for (const { tag, identifier } of this.model.tagSymbols) {
      this.tagSymbols.set(tag, identifier);
    }
  }

  private nameTag(tag: number): string {
    // TODO
    const prefix = this.tagSymbols.get(tag) ?? `_TAG_${tag}`;
    const suffix = tag > this.model.namedPatternCnt ? `_${++this.lastAutoId}` : "";
    return `${prefix}${suffix}`;
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

    // TODO
    assert(edge.constraints.length <= 1, "PatternEdge with multiple Constraints is unimplemented");
    const inner = edge.constraints[0] && this.trConstraint(edge.constraints[0]);
    return new P.VariablePattern(this.nameTag(edge.tag), { inner });
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
    // TODO
    assert(false, "UserFnCall is unimplemented");
  }

  private trValue(value: Component): P.Pattern {
    return new P.ConstPattern(new Name([value]));
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
