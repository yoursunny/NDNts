import type { Name } from "@ndn/packet";
import MultiMap from "mnemonist/multi-map";

import type { Pattern, Vars, VarsLike } from "./pattern";

/** Policy in a trust schema. */
export class TrustSchemaPolicy {
  private readonly patterns = new Map<string, Pattern>();
  private readonly rules = new MultiMap<string, string>(Set);

  public listPatterns(): Iterable<[string, Pattern]> {
    return this.patterns;
  }

  public getPattern(id: string): Pattern {
    const pattern = this.patterns.get(id);
    if (!pattern) {
      throw new Error(`unknown pattern ${id}`);
    }
    return pattern;
  }

  public addPattern(id: string, pattern: Pattern) {
    if (this.patterns.has(id)) {
      throw new Error(`duplicate pattern ${id}`);
    }
    this.patterns.set(id, pattern);
  }

  public listRules(): Iterable<[string, string]> {
    return this.rules;
  }

  public hasRule(packetId: string, signerId: string): boolean {
    return this.rules.get(packetId)?.has(signerId) ?? false;
  }

  public addRule(packetId: string, signerId: string): void {
    if (this.rules.has(packetId)) {
      throw new Error(`duplicate rule for ${packetId}`);
    }
    this.getPattern(packetId);
    this.getPattern(signerId);
    this.rules.set(packetId, signerId);
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
        if (!this.hasRule(pId, sId)) {
          continue;
        }
        let ok = true;
        for (const [k, sv] of Object.entries(sVars)) {
          const pv = pVars[k];
          if (pv && !pv.equals(sv)) {
            ok = false;
          }
        }
        if (ok) {
          return true;
        }
      }
    }

    return false;
  }

  public *buildSignerNames(packet: TrustSchemaPolicy.MatchInput, vars: VarsLike = {}): Iterable<Name> {
    packet = this.match(packet);
    for (const { id: pId, vars: pVars } of packet) {
      for (const signerId of this.rules.get(pId) ?? []) {
        yield* this.getPattern(signerId).build({ ...vars, ...pVars });
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
