import "@ndn/packet/test-fixture/expect";

import { Name } from "@ndn/packet";
import { expect, test } from "vitest";

import { TrustSchemaPolicy, versec } from "../..";

const { ast: A, nest: N, token: T } = versec;

test("parser", () => {
  const tokens = Array.from(T.scan(`
    _variable: "constant", #pub: /_variable/("A"|
    "B") <= signer1|signer2 <= signer3
    ident1 :#pub & {
      constraint1: "value1"
      constraint2: "value2",
    } & (
      { constraint3 :"value3" } | { constraint4: "value4"/function4() }),
    // comment
    signer4 <= signer5 <=
        // comment
      signer6
  `));
  expect(tokens.map((token) => token.constructor)).toEqual([
    T.Ident, T.Colon, T.ComponentLit, T.Comma, // _variable: "constant",
    T.Ident, T.Colon, T.Slash, T.Ident, T.Slash, // #pub: /_variable/
    T.ParenL, T.ComponentLit, T.Or, T.ComponentLit, T.ParenR, // ("A"|"B")
    T.ArrowL, T.Ident, T.Or, T.Ident, T.ArrowL, T.Ident, T.Comma, // <= signer1|signer2 <= signer3,
    T.Ident, T.Colon, T.Ident, T.And, T.BraceL, // ident1: #pub & {
    T.Ident, T.Colon, T.ComponentLit, T.Comma, // constraint1: "value1",
    T.Ident, T.Colon, T.ComponentLit, T.Comma, // constraint2: "value2",
    T.BraceR, T.And, T.ParenL, // } & (
    T.BraceL, T.Ident, T.Colon, T.ComponentLit, T.BraceR, T.Or, // { constraint3: "value3" } |
    T.BraceL, T.Ident, T.Colon, T.ComponentLit, T.Slash, // { constraint4: "value4"/
    T.Ident, T.ParenL, T.ParenR, T.BraceR, T.ParenR, T.Comma, // function4() }),
    T.Ident, T.ArrowL, T.Ident, T.ArrowL, T.Ident, T.Comma, // signer4 <= signer5 <= signer6,
  ]);
  expect(() => Array.from(T.scan("="))).toThrow(/unrecognized/);
  expect(() => Array.from(T.scan("\"hello"))).toThrow(/unterminated/);

  const units = Array.from(N.scan(tokens));
  expect(units.map((u) => u.constructor)).toEqual([
    T.Ident, T.Colon, T.ComponentLit, T.Comma, // _variable: "constant",
    T.Ident, T.Colon, T.Slash, T.Ident, T.Slash, N.Paren, // #pub: /_variable/("A"|"B")
    T.ArrowL, T.Ident, T.Or, T.Ident, T.ArrowL, T.Ident, T.Comma, // <= signer1|signer2 <= signer3,
    T.Ident, T.Colon, T.Ident, T.And, N.Brace, T.And, N.Paren, T.Comma, // ident1: #pub & {...} & (...),
    T.Ident, T.ArrowL, T.Ident, T.ArrowL, T.Ident, T.Comma, // signer4 <= signer5 <= signer6,
  ]);
  expect(() => Array.from(N.scan(T.scan("(}")))).toThrow(/unbalanced/);
  expect(() => Array.from(N.scan(T.scan("(({})")))).toThrow(/unbalanced/);

  const groups = N.split(T.Comma, units);
  expect(groups.map((g) => g.length)).toEqual([3, 12, 7, 5, 0]);
  const groupsNonEmpty = N.split(T.Comma, units, true);
  expect(groupsNonEmpty.map((g) => g.length)).toEqual([3, 12, 7, 5]);

  const schema = A.parse(tokens);
  expect(schema.stmts.map((stmt) => [stmt.ident.id, stmt.definition?.constructor, stmt.signingChain.length])).toEqual([
    ["_variable", A.ComponentLit, 0],
    ["#pub", A.Name, 2],
    ["ident1", A.Constrained, 0],
    ["signer4", undefined, 2],
  ]);
  expect(() => A.parse(T.scan("\"const\": \"const\""))).toThrow(/statement must start with ident/);
  expect(() => A.parse(T.scan("ident/\"const\" <= signer"))).toThrow(/invalid definition/);
  expect(() => A.parse(T.scan("s: & { comp: \"value\" }"))).toThrow(/expression must have name/);
  expect(() => A.parse(T.scan("s: \"a\"\"b\""))).toThrow(/component should have one token/);
  expect(() => A.parse(T.scan("s: \"a\"/{}/\"c\""))).toThrow(/unexpected token for component/);
  expect(() => A.parse(T.scan("s: a/b & {} / {}"))).toThrow(/invalid component constraint equation/);
  expect(() => A.parse(T.scan("s: a/b & {} {}"))).toThrow(/invalid component constraint equation/);
  expect(() => A.parse(T.scan("s: a/b & { a & \"c\" }"))).toThrow(/invalid component constraint term/);
  expect(() => A.parse(T.scan("s: a <= \"signer\""))).toThrow(/invalid signing constraint/);
  expect(() => A.parse(T.scan("s: a <= <= signer"))).toThrow(/invalid signing constraint/);
});

test("compile", () => {
  const policy = versec.load(`
    // modified from DNMP example
    _network: "example"/"net2"
    rootCert: _network/_key
    deviceCert: _network/"device"/deviceName/_key <= rootCert
    roleCert: _network/_role/(personName|(department/personName))/_key <= rootCert
    adminCert: roleCert & { _role: "admin" }
    userCert: roleCert & { _role: "user" }
    adminCommand: #command <= adminCert
    userCommand: #command & ({ verb: "ping" } | { target: "local" })
    _command: _network/_topic/target/verb/params/_commandTime & { _commandTime: timestamp() }
    #command: _command & { _topic: "command" }
    userCommand <= userCert
    reply <= deviceCert
    reply: _command/deviceName/_replyTime & { _topic: "reply" } & { _replyTime: timestamp() }
    _key: "KEY"/_/_/_
  `);
  expect(versec.load(versec.print(policy))).toBeInstanceOf(TrustSchemaPolicy);

  const adminCert = new Name("/example/net2/admin/yoursunny/KEY/7daa8ebf");
  const userCert = new Name("/example/net2/user/sales/person/KEY/c00240ba");
  const deviceCert = new Name("/example/net2/device/DAL/KEY/2e77f31e");
  const adminCommand = new Name("/example/net2/command/DAL/traceroute/LAX/56=%01");
  const userCommand = new Name("/example/net2/command/DAL/ping/LAX/56=%01");
  const reply = new Name("/example/net2/reply/DAL/ping/LAX/56=%01/DAL/56=%02");

  const match = (name: Name) => Array.from(policy.match(name), ({ id }) => id);

  let m = match(adminCert);
  expect(m).toContain("adminCert");
  expect(m).not.toContain("userCert");

  m = match(adminCommand);
  expect(m).toContain("adminCommand");
  expect(m).not.toContain("userCommand");

  m = match(userCommand);
  expect(m).toContain("adminCommand");
  expect(m).toContain("userCommand");

  m = match(deviceCert);
  expect(m).toContain("deviceCert");

  m = match(reply);
  expect(m).toContain("reply");

  expect(policy.canSign(adminCommand, adminCert)).toBeTruthy();
  expect(policy.canSign(userCommand, adminCert)).toBeTruthy();
  expect(policy.canSign(reply, adminCert)).toBeFalsy();
  expect(policy.canSign(adminCommand, userCert)).toBeFalsy();
  expect(policy.canSign(userCommand, userCert)).toBeTruthy();
  expect(policy.canSign(reply, userCert)).toBeFalsy();
  expect(policy.canSign(adminCommand, deviceCert)).toBeFalsy();
  expect(policy.canSign(userCommand, deviceCert)).toBeFalsy();
  expect(policy.canSign(reply, deviceCert)).toBeTruthy();

  expect(() => versec.load(`
    s: "a"
    s: "b"
  `)).toThrow(/duplicate definition/);
  expect(() => versec.load("s: s")).toThrow(/cyclic dependency/);
  expect(() => versec.load("s: timestamp(\"a\")")).toThrow(/timestamp\(.*arguments/);
  expect(() => versec.load("s: a/sysid(\"b\")")).toThrow(/sysid\(.*arguments/);
  expect(() => versec.load("s: foo()")).toThrow(/unknown function/);
});

test("lvs", () => {
  const policy = versec.load(`
    // taken from python-ndn LVS example

    // Site prefix is "/a/blog"
    #site: "a"/"blog"
    // The trust anchor name is of pattern /a/blog/KEY/<key-id>/<issuer>/<cert-id>
    #root: #site/#KEY
    // Posts are signed by some author's key
    #article: #site/"article"/category/year/month <= #author
    // An author's key is signed by an admin's key
    #author: #site/role/author/#KEY & { role: "author" } <= #admin
    // An admin's key is signed by the root key
    #admin: #site/"admin"/admin/#KEY <= #root

    #KEY: "KEY"/_/_/_
  `);
  expect(versec.load(versec.print(policy))).toBeInstanceOf(TrustSchemaPolicy);

  expect(policy.canSign(new Name("/a/blog/article/math/2022/03"), new Name("/a/blog/author/xinyu/KEY/1/admin/1"))).toBeTruthy();
  expect(policy.canSign(new Name("/a/blog/author/xinyu/KEY/1/admin/1"), new Name("/a/blog/admin/admin/KEY/1/root/1"))).toBeTruthy();
  expect(policy.canSign(new Name("/a/blog/author/xinyu/KEY/1/admin/1"), new Name("/a/blog/KEY/1/self/1"))).toBeFalsy();
});
