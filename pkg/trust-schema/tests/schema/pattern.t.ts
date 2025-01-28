import "@ndn/packet/test-fixture/expect";

import { Version } from "@ndn/naming-convention2";
import { Name, type NameLike } from "@ndn/packet";
import { expect, test, vi } from "vitest";

import { pattern as P, simplifyPattern } from "../..";

function match(p: P.Pattern, name: NameLike): P.Vars[] {
  return Array.from(p.match(Name.from(name)));
}

function build(p: P.Pattern, vars: P.VarsLike): Name[] {
  return Array.from(p.build(vars)).toSorted(Name.compare);
}

test("const variable concat", () => {
  const p = new P.ConcatPattern([
    new P.ConstPattern("/P/Q"),
    new P.VariablePattern("a"),
    new P.VariablePattern("b", { minComps: 0, maxComps: 2 }),
    new P.VariablePattern("c", {
      minComps: 2,
      maxComps: 2,
      filter: {
        accept: (name) => name.equals("/c/c"),
      },
    }),
  ]);

  expect(match(p, "/")).toHaveLength(0);
  expect(match(p, "/Z/Z/Z/Z/Z")).toHaveLength(0);
  expect(match(p, "/P/Q")).toHaveLength(0);

  let m = match(p, "/P/Q/a/c/c");
  expect(m).toHaveLength(1);
  expect(m[0]!.get("a")).toEqualName("/a");
  expect(m[0]!.get("b")).toEqualName("/");
  expect(m[0]!.get("c")).toEqualName("/c/c");

  m = match(p, "/P/Q/a/b/c/c");
  expect(m).toHaveLength(1);
  expect(m[0]!.get("a")).toEqualName("/a");
  expect(m[0]!.get("b")).toEqualName("/b");
  expect(m[0]!.get("c")).toEqualName("/c/c");

  m = match(p, "/P/Q/a/b/b/c/c");
  expect(m).toHaveLength(1);
  expect(m[0]!.get("a")).toEqualName("/a");
  expect(m[0]!.get("b")).toEqualName("/b/b");
  expect(m[0]!.get("c")).toEqualName("/c/c");

  expect(match(p, "/P/Q/a/b/b/c/cc")).toHaveLength(0);

  let b = build(p, { a: "/a", b: "/", c: "/c/c" });
  expect(b).toHaveLength(1);
  expect(b[0]).toEqualName("/P/Q/a/c/c");

  b = build(p, { a: "/a", b: "/b", c: "/c/c" });
  expect(b).toHaveLength(1);
  expect(b[0]).toEqualName("/P/Q/a/b/c/c");

  expect(build(p, {})).toHaveLength(0);
  expect(build(p, { a: "/a", b: "/b", c: "/c/cc" })).toHaveLength(0);
});

test("variable.inner+filter", () => {
  const accept = vi.fn<P.VariablePattern.Filter["accept"]>();
  const p = new P.VariablePattern("outer", {
    minComps: 0,
    maxComps: Infinity,
    inner: new P.ConcatPattern([
      new P.ConstPattern("/prefix"),
      new P.VariablePattern("suffix"),
    ]),
    filter: { accept },
  });

  const checkedAccept = (name: Name, vars: P.Vars) => {
    expect(name).toEqualName("/prefix/suffix");
    expect(vars.get("suffix")).toEqualName("/suffix");
    return true;
  };

  accept.mockImplementation(checkedAccept);
  let m = match(p, "/prefix/suffix");
  expect(m).toHaveLength(1);
  expect(m[0]!.get("suffix")).toEqualName("/suffix");
  expect(m[0]!.get("outer")).toEqualName("/prefix/suffix");
  expect(accept).toHaveBeenCalledTimes(1);
  accept.mockReset();

  accept.mockReturnValue(false);
  m = match(p, "/prefix/suffix");
  expect(m).toHaveLength(0);
  expect(accept).toHaveBeenCalledTimes(1);
  accept.mockReset();

  accept.mockReturnValue(true);
  m = match(p, "/not-prefix/suffix");
  expect(m).toHaveLength(0);
  expect(accept).not.toHaveBeenCalled();
  accept.mockReset();

  accept.mockImplementation(checkedAccept);
  let b = build(p, { outer: "/prefix/suffix" });
  expect(b).toHaveLength(1);
  expect(b[0]).toEqualName("/prefix/suffix");
  expect(accept).toHaveBeenCalledTimes(1);
  accept.mockReset();

  accept.mockImplementation(checkedAccept);
  b = build(p, { suffix: "/suffix" });
  expect(b).toHaveLength(1);
  expect(b[0]).toEqualName("/prefix/suffix");
  expect(accept).toHaveBeenCalledTimes(1);
  accept.mockReset();

  accept.mockReturnValue(false);
  b = build(p, { outer: "/prefix/suffix" });
  expect(b).toHaveLength(0);
  expect(accept).toHaveBeenCalledTimes(1);
  accept.mockReset();

  accept.mockReturnValue(true);
  b = build(p, { outer: "/not-prefix/suffix" });
  expect(b).toHaveLength(0);
  expect(accept).not.toHaveBeenCalled();
  accept.mockReset();

  accept.mockReturnValue(true);
  b = build(p, { suffix: "/suffix/too-long" });
  expect(b).toHaveLength(0);
  expect(accept).not.toHaveBeenCalled();
  accept.mockReset();

  accept.mockReturnValue(true);
  b = build(p, { outer: "/prefix/suffix", suffix: "/different-suffix" });
  expect(b).toHaveLength(0);
  expect(accept).not.toHaveBeenCalled();
  accept.mockReset();
});

test("certname", () => {
  const p = new P.ConcatPattern([
    new P.VariablePattern("subject", { maxComps: Infinity }),
    new P.CertNamePattern(),
  ]);

  expect(match(p, "/identity")).toHaveLength(0);
  expect(match(p, "/identity/KEY")).toHaveLength(0);
  expect(match(p, "/identity/KEY/key-id/issuer-id")).toHaveLength(0);

  let m = match(p, "/identity/KEY/key-id");
  expect(m).toHaveLength(1);
  expect(m[0]!.get("subject")).toEqualName("/identity");

  m = match(p, "/identity/KEY/key-id/issuer-id/version");
  expect(m).toHaveLength(1);
  expect(m[0]!.get("subject")).toEqualName("/identity");

  const b = build(p, { subject: "/identity" });
  expect(b).toHaveLength(1);
  expect(b[0]).toEqualName("/identity");
});

test("alternate", () => {
  const p = new P.AlternatePattern([
    new P.ConcatPattern([
      new P.ConstPattern("/P"),
      new P.VariablePattern("a"),
      new P.ConstPattern("/A"),
    ]),
    new P.ConcatPattern([
      new P.ConstPattern("/P"),
      new P.VariablePattern("b"),
      new P.ConstPattern("/B"),
    ]),
  ]);

  expect(match(p, "/P/c/C")).toHaveLength(0);

  let m = match(p, "/P/a/A");
  expect(m).toHaveLength(1);
  expect(m[0]!.get("a")).toEqualName("/a");

  m = match(p, "/P/b/B");
  expect(m).toHaveLength(1);
  expect(m[0]!.get("b")).toEqualName("/b");

  expect(build(p, { c: "/c" })).toHaveLength(0);

  let b = build(p, { a: "/a" });
  expect(b).toHaveLength(1);
  expect(b[0]).toEqualName("/P/a/A");

  b = build(p, { b: "/b" });
  expect(b).toHaveLength(1);
  expect(b[0]).toEqualName("/P/b/B");

  b = build(p, { a: "/a", b: "/b" });
  expect(b).toHaveLength(2);
  expect(b[0]).toEqualName("/P/a/A");
  expect(b[1]).toEqualName("/P/b/B");
});

test("overlap", () => {
  const p = new P.OverlapPattern([
    new P.ConcatPattern([
      new P.ConstPattern("/P"),
      new P.VariablePattern("a", { minComps: 1, maxComps: 2 }),
      new P.VariablePattern("a", { minComps: 1, maxComps: 2 }),
    ]),
    new P.ConcatPattern([
      new P.ConstPattern("/P"),
      new P.VariablePattern("b", { minComps: 1, maxComps: 3 }),
      new P.VariablePattern("c", { minComps: 1, maxComps: 2 }),
    ]),
    new P.ConcatPattern([
      new P.ConstPattern("/P"),
      new P.VariablePattern("d", { minComps: 1, maxComps: 6 }),
    ]),
  ]);

  expect(match(p, "/P")).toHaveLength(0);
  expect(match(p, "/P/x")).toHaveLength(0);
  expect(match(p, "/P/x/y")).toHaveLength(0);
  expect(match(p, "/P/x/y/x/z")).toHaveLength(0);

  let m = match(p, "/P/x/x");
  expect(m).toHaveLength(1);
  expect(m[0]!.get("a")).toEqualName("/x");
  expect(m[0]!.get("b")).toEqualName("/x");
  expect(m[0]!.get("c")).toEqualName("/x");
  expect(m[0]!.get("d")).toEqualName("/x/x");

  m = match(p, "/P/x/y/x/y");
  expect(m).toHaveLength(2);
  m.sort((lhs, rhs) => lhs.get("b")!.length - rhs.get("b")!.length);
  expect(m[0]!.get("a")).toEqualName("/x/y");
  expect(m[0]!.get("b")).toEqualName("/x/y");
  expect(m[0]!.get("c")).toEqualName("/x/y");
  expect(m[0]!.get("d")).toEqualName("/x/y/x/y");
  expect(m[1]!.get("a")).toEqualName("/x/y");
  expect(m[1]!.get("b")).toEqualName("/x/y/x");
  expect(m[1]!.get("c")).toEqualName("/y");
  expect(m[1]!.get("d")).toEqualName("/x/y/x/y");

  expect(build(p, {})).toHaveLength(0);
  expect(build(p, { a: "/x", b: "/x/x" })).toHaveLength(0);
  expect(build(p, { a: "/x", d: "/x/y" })).toHaveLength(0);

  let b = build(p, { a: "/x" });
  expect(b).toHaveLength(1);
  expect(b[0]).toEqualName("/P/x/x");

  b = build(p, { a: "/x/y" });
  expect(b).toHaveLength(1);
  expect(b[0]).toEqualName("/P/x/y/x/y");

  b = build(p, { a: "/x/y", b: "/x/y/x" });
  expect(b).toHaveLength(1);
  expect(b[0]).toEqualName("/P/x/y/x/y");

  b = build(p, { d: "/x/x" });
  expect(b).toHaveLength(1);
  expect(b[0]).toEqualName("/P/x/x");

  b = build(p, { d: "/x/y/x/y" });
  expect(b).toHaveLength(1);
  expect(b[0]).toEqualName("/P/x/y/x/y");
});

test("simplify", () => {
  const p = simplifyPattern(new P.AlternatePattern([
    new P.ConcatPattern([
      new P.ConcatPattern([
        new P.ConstPattern("/A"),
      ]),
      new P.ConcatPattern([
        new P.ConstPattern("/B"),
        new P.ConstPattern("/C"),
        new P.CertNamePattern(),
      ]),
    ]),
    new P.AlternatePattern([
      new P.OverlapPattern([
        new P.ConstPattern("/M/N"),
      ]),
      new P.VariablePattern("x", {
        inner: new P.VariablePattern("v"),
        filter: new P.VariablePattern.ConventionFilter(Version),
      }),
    ]),
    new P.OverlapPattern([
      new P.OverlapPattern([
        new P.ConstPattern("/M/N"),
      ]),
      new P.OverlapPattern([
        new P.VariablePattern("x", {
          maxComps: 3,
          inner: new P.ConcatPattern([
            new P.ConstPattern("/M"),
            new P.ConstPattern("/N"),
          ]),
        }),
      ]),
    ]),
  ]));

  expect(p).toBeInstanceOf(P.AlternatePattern);
  if (p instanceof P.AlternatePattern) {
    expect(p.choices).toHaveLength(4);
    const [p0, p1, p2, p3] = p.choices;

    expect(p0).toBeInstanceOf(P.ConcatPattern);
    if (p0 instanceof P.ConcatPattern) {
      expect(p0.parts).toHaveLength(2);
      const [p00, p01] = p0.parts;
      expect(p00).toBeInstanceOf(P.ConstPattern);
      if (p00 instanceof P.ConstPattern) {
        expect(p00.name).toEqualName("/A/B/C");
      }
      expect(p01).toBeInstanceOf(P.CertNamePattern);
    }

    expect(p1).toBeInstanceOf(P.ConstPattern);
    if (p1 instanceof P.ConstPattern) {
      expect(p1.name).toEqualName("/M/N");
    }

    expect(p2).toBeInstanceOf(P.VariablePattern);
    if (p2 instanceof P.VariablePattern) {
      expect(p2.id).toBe("x");
      expect(p2.inner).toBeInstanceOf(P.VariablePattern);
      expect(p2.filter).toBeInstanceOf(P.VariablePattern.ConventionFilter);
    }

    expect(p3).toBeInstanceOf(P.OverlapPattern);
    if (p3 instanceof P.OverlapPattern) {
      expect(p3.branches).toHaveLength(2);
      const [p30, p31] = p3.branches;
      expect(p30).toBeInstanceOf(P.ConstPattern);
      expect(p31).toBeInstanceOf(P.VariablePattern);
      if (p31 instanceof P.VariablePattern) {
        expect(p31.inner).toBeInstanceOf(P.ConstPattern);
      }
    }
  }
});
