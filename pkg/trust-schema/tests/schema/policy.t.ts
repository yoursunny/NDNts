import "@ndn/packet/test-fixture/expect";

import { Name } from "@ndn/packet";
import { expect, test } from "vitest";

import { pattern as P, TrustSchemaPolicy } from "../..";

test("simple", () => {
  const policy = new TrustSchemaPolicy();
  expect(Array.from(policy.listPatterns())).toHaveLength(0);
  expect(Array.from(policy.listRules())).toHaveLength(0);

  expect(policy.getPattern("A", true)).toBeUndefined();
  expect(() => policy.getPattern("A")).toThrow(/unknown pattern/);
  const pA = new P.ConcatPattern([
    new P.ConstPattern("/A"),
    new P.VariablePattern("V"),
  ]);
  policy.addPattern("A", pA);
  expect(() => policy.addPattern("A", new P.ConstPattern("/A"))).toThrow(/duplicate pattern/);
  expect(policy.getPattern("A")).toBe(pA);
  expect(Array.from(policy.listPatterns())).toEqual([["A", pA]]);

  expect(() => policy.addRule("A", "B")).toThrow(/unknown pattern/);
  expect(() => policy.addRule("B", "A")).toThrow(/unknown pattern/);

  const pB = new P.ConcatPattern([
    new P.ConstPattern("/B"),
    new P.VariablePattern("V"),
    new P.CertNamePattern(),
  ]);
  policy.addPattern("B", pB);

  expect(policy.hasRule("A", "B")).toBeFalsy();
  policy.addRule("A", "B");
  expect(policy.hasRule("A", "B")).toBeTruthy();
  expect(Array.from(policy.listRules())).toEqual([["A", "B"]]);
  policy.addRule("A", "B");
  expect(Array.from(policy.listRules())).toHaveLength(1);

  const mA = policy.match(new Name("/A/1"));
  expect(mA).toHaveLength(1);
  expect(mA[0]!.id).toBe("A");
  expect(mA[0]!.vars.size).toBe(1);
  expect(mA[0]!.vars.get("V")).toEqualName("/1");

  const mB = policy.match(new Name("/B/1/KEY/key-id/signer-id/version"));
  expect(mB).toHaveLength(1);
  expect(mB[0]!.id).toBe("B");
  expect(mB[0]!.vars.size).toBe(1);
  expect(mB[0]!.vars.get("V")).toEqualName("/1");

  expect(policy.canSign(mA, mB)).toBeTruthy();
  expect(policy.canSign(mA, [])).toBeFalsy();
  expect(policy.canSign([], mB)).toBeFalsy();
  expect(policy.canSign(mA, new Name("/B/2/KEY/key-id/signer-id/version"))).toBeFalsy();
  expect(policy.canSign(new Name("/A/2"), mB)).toBeFalsy();

  expect(policy.buildSignerNames([])).toEqualNames([]);
  expect(policy.buildSignerNames(mA)).toEqualNames(["/B/1"]);
});
