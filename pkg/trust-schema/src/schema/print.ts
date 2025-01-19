import { getOrInsert } from "@ndn/util";

import { AlternatePattern, CertNamePattern, ConcatPattern, ConstPattern, OverlapPattern, type Pattern, VariablePattern } from "./pattern";
import type { TrustSchemaPolicy } from "./policy";

function printPattern(p: Pattern, ctx: printESM.Context): string {
  const { indent } = ctx;
  if (p instanceof ConstPattern) {
    return `${indent}new P.ConstPattern(${JSON.stringify(p.name.toString())})`;
  }
  if (p instanceof VariablePattern) {
    const opts: string[] = [];
    if (p.minComps !== 1) {
      opts.push(`minComps: ${p.minComps}`);
    }
    if (p.maxComps !== 1) {
      opts.push(`maxComps: ${p.maxComps}`);
    }
    if (p.inner) {
      opts.push(`inner: ${printPattern(p.inner, ctx).trimStart()}`);
    }
    if (p.filter) {
      const filter = p.filter as Partial<printESM.PrintableFilter>;
      if (typeof filter.printESM === "function") {
        opts.push(`filter: ${filter.printESM(ctx).trimStart()}`);
      } else {
        opts.push(`filter: { accept(name, vars) { throw new Error(${
          JSON.stringify(`cannot translate filter ${p.filter.constructor.name}`)}) } }`);
      }
    }
    const optsArg = opts.length === 0 ? "" : `, { ${opts.join(", ")} }`;
    return `${indent}new P.VariablePattern(${JSON.stringify(p.id)}${optsArg})`;
  }
  if (p instanceof CertNamePattern) {
    return `${indent}new P.CertNamePattern()`;
  }
  if (p instanceof ConcatPattern) {
    return printSequence("ConcatPattern", p.parts, ctx);
  }
  if (p instanceof AlternatePattern) {
    return printSequence("AlternatePattern", p.choices, ctx);
  }
  if (p instanceof OverlapPattern) {
    return printSequence("OverlapPattern", p.branches, ctx);
  }
  return `${indent}throw new Error(${
    JSON.stringify(`cannot translate pattern ${p.constructor.name}`)})`;
}

function printSequence(typ: string, list: Pattern[], ctx: printESM.Context): string {
  const { indent } = ctx;
  const inner = { ...ctx, indent: `  ${indent}` };
  return `${indent}new P.${typ}([\n${
    list.map((p) => printPattern(p, inner)).join(",\n")
  },\n${indent}])`;
}

/** Print policy as ECMAScript module. */
export function printESM(policy: TrustSchemaPolicy): string {
  const imports = new Map<string, Set<string>>();
  const ctx: printESM.Context = {
    indent: "",
    addImport(module, ...identifiers) {
      const s = getOrInsert(imports, module, () => new Set());
      for (const identifier of identifiers) {
        s.add(identifier);
      }
    },
  };
  ctx.addImport("@ndn/trust-schema", "TrustSchemaPolicy", "pattern as P");

  const lines: string[] = [];
  lines.push(
    "",
    "export const policy = new TrustSchemaPolicy();",
    "",
  );
  for (const [id, p] of policy.listPatterns()) {
    lines.push(`policy.addPattern(${JSON.stringify(id)}, ${printPattern(p, ctx)});`);
  }
  lines.push("");
  for (const [packet, signer] of policy.listRules()) {
    lines.push(`policy.addRule(${JSON.stringify(packet)}, ${JSON.stringify(signer)});`);
  }
  lines.push("");

  const pkgs = Array.from(imports.keys()).toSorted((a, b) => -a.localeCompare(b));
  for (const pkg of pkgs) {
    const tokens = Array.from(imports.get(pkg)!).toSorted((a, b) => a.localeCompare(b));
    if (tokens.length === 1 && tokens[0]!.startsWith("* as ")) {
      lines.unshift(`import ${tokens[0]} from ${JSON.stringify(pkg)};`);
    } else {
      lines.unshift(`import { ${tokens.join(", ")} } from ${JSON.stringify(pkg)};`);
    }
  }
  return lines.join("\n");
}

export namespace printESM {
  export interface Context {
    indent: string;
    addImport: (module: string, ...identifier: readonly string[]) => void;
  }

  export interface PrintableFilter extends VariablePattern.Filter {
    printESM: (ctx: Context) => string;
  }
}
