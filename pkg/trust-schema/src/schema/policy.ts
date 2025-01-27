import type { Name } from "@ndn/packet";
import { assert, MultiMap } from "@ndn/util";

import { type Pattern, Vars, type VarsLike } from "./pattern";

/** Policy in a trust schema. */
export class TrustSchemaPolicy {
  private readonly patterns = new Map<string, Pattern>();
  private readonly rules = new MultiMap<string, string>();

  public listPatterns(): Iterable<[id: string, pattern: Pattern]> {
    return this.patterns;
  }

  public getPattern(id: string): Pattern;
  public getPattern(id: string, optional: true): Pattern | undefined;

  public getPattern(id: string, optional = false) {
    const pattern = this.patterns.get(id);
    assert(optional || pattern, `unknown pattern ${id}`);
    return pattern;
  }

  public addPattern(id: string, pattern: Pattern) {
    assert(!this.patterns.has(id), `duplicate pattern ${id}`);
    this.patterns.set(id, pattern);
  }

  public listRules(): Iterable<[packetId: string, signerId: string]> {
    return this.rules;
  }

  public hasRule(packetId: string, signerId: string): boolean {
    return this.rules.list(packetId).has(signerId);
  }

  public addRule(packetId: string, signerId: string): void {
    if (this.hasRule(packetId, signerId)) {
      return;
    }
    this.getPattern(packetId);
    this.getPattern(signerId);
    this.rules.add(packetId, signerId);
  }

  public match(name: TrustSchemaPolicy.MatchInput): TrustSchemaPolicy.Match[] {
    if (Array.isArray(name)) {
      return name;
    }

    const matches: TrustSchemaPolicy.Match[] = [];
    for (const [id, p] of this.patterns) {
      for (const vars of p.match(name)) {
        matches.push({ id, vars });
      }
    }
    return matches;
  }

  public canSign(packet: TrustSchemaPolicy.MatchInput, signer: TrustSchemaPolicy.MatchInput): boolean {
    packet = this.match(packet);
    signer = this.match(signer);
    for (const { id: pId, vars: pVars } of packet) {
      for (const { id: sId, vars: sVars } of signer) {
        if (this.hasRule(pId, sId) && Vars.consistent(pVars, sVars)) {
          return true;
        }
      }
    }

    return false;
  }

  public *buildSignerNames(packet: TrustSchemaPolicy.MatchInput, vars: VarsLike = {}): Iterable<Name> {
    packet = this.match(packet);
    for (const { id: pId, vars: pVars } of packet) {
      const signers = this.rules.list(pId);
      for (const signerId of signers) {
        yield* this.getPattern(signerId).build(vars, pVars);
      }
    }
  }
}

export namespace TrustSchemaPolicy {
  export interface Match {
    id: string;
    vars: Vars;
  }

  export type MatchInput = Name | Match[];
}
