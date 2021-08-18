import { AlternatePattern, CertNamePattern, ConcatPattern, ConstPattern, Pattern, VariablePattern } from "./pattern";
import type { TrustSchemaPolicy } from "./policy";

function printPattern(p: Pattern, indent = ""): string {
  if (p instanceof ConstPattern) {
    return `${indent}new P.ConstPattern(${JSON.stringify(p.name.toString())})`;
  }
  if (p instanceof VariablePattern) {
    const opts = [
      `minComps: ${p.minComps}`,
      `maxComps: ${p.maxComps}`,
    ];
    if (p.inner) {
      opts.push(`inner: ${printPattern(p.inner)}`);
    }
    if (p.filter) {
      opts.push(`filter: { accept() { throw new Error(${
        JSON.stringify(`cannot translate filter ${p.filter.constructor.name}`)}) } }`);
    }
    return `${indent}new P.VariablePattern(${JSON.stringify(p.id)}, { ${opts.join(", ")} })`;
  }
  if (p instanceof CertNamePattern) {
    return `${indent}new P.CertNamePattern()`;
  }
  if (p instanceof ConcatPattern) {
    return printSequence("ConcatPattern", p.parts, indent);
  }
  if (p instanceof AlternatePattern) {
    return printSequence("AlternatePattern", p.choices, indent);
  }
  return `${indent}throw new Error(${
    JSON.stringify(`cannot translate pattern ${p.constructor.name}`)})`;
}

function printSequence(typ: string, list: Pattern[], indent: string): string {
  return `${indent}new P.${typ}([\n${
    list.map((p) => printPattern(p, `  ${indent}`)).join(",\n")
  },\n${indent}])`;
}

/** Print policy as ECMAScript module. */
export function printESM(policy: TrustSchemaPolicy): string {
  const lines: string[] = [];
  lines.push(
    "import { pattern as P, TrustSchemaPolicy } from \"@ndn/trust-schema\";",
    "",
    "export const policy = new TrustSchemaPolicy();",
    "",
  );
  for (const [id, p] of policy.listPatterns()) {
    lines.push(`policy.addPattern(${JSON.stringify(id)}, ${printPattern(p)});`);
  }
  lines.push("");
  for (const [packet, signer] of policy.listRules()) {
    lines.push(`policy.addRule(${JSON.stringify(packet)}, ${JSON.stringify(signer)});`);
  }
  lines.push("");
  return lines.join("\n");
}
