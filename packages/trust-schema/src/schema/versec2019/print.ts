import { AlternatePattern, CertNamePattern, ConcatPattern, ConstPattern, Pattern, VariablePattern } from "../pattern";
import { TrustSchemaPolicy } from "../policy";

function printPattern(p: Pattern): string {
  if (p instanceof ConstPattern) {
    return p.name.toString().slice(1);
  }
  if (p instanceof VariablePattern) {
    return `<_${p.id}${
      p.inner ? `!inner:${p.inner.constructor.name}` : ""}${
      p.filter ? `!filter:${p.filter.constructor.name}` : ""}>`;
  }
  if (p instanceof CertNamePattern) {
    return "<_KEY>";
  }
  if (p instanceof ConcatPattern) {
    return printSequence(p.parts, "/", [ConcatPattern, AlternatePattern]);
  }
  if (p instanceof AlternatePattern) {
    return printSequence(p.choices, "|", [AlternatePattern]);
  }
  return `<!${p.constructor.name}>`;
}

function printSequence(list: Pattern[], sep: string, parenTypes: Array<typeof Pattern>): string {
  return list.map((p) => {
    let needParens = false;
    for (const ctor of parenTypes) {
      needParens ||= p instanceof ctor;
    }
    return needParens ? `(${printPattern(p)})` : printPattern(p);
  }).join(sep);
}

/**
 * Print policy to VerSec 2019 syntax.
 * https://pollere.net/Pdfdocs/BuildingBridge.pdf page 14
 */
export function print(policy: TrustSchemaPolicy): string {
  const lines: string[] = [];
  for (const [id, p] of policy.listPatterns()) {
    lines.push(`${id} = ${printPattern(p)}`);
  }
  for (const [packet, signer] of policy.listRules()) {
    lines.push(`${packet} <= ${signer}`);
  }
  return lines.join("\n");
}
