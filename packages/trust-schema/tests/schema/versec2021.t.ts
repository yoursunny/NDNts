import "@ndn/packet/test-fixture/expect";

import { Name, NameLike } from "@ndn/packet";

import { TrustSchemaPolicy, versec2021 } from "../..";

const { ast: A, nest: N, token: T } = versec2021;

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
  const policy = versec2021.load(`
    // modified from DNMP example
    _network: "example"/"net2"
    rootCert: _network/_key
    deviceCert: _network/"device"/deviceName/_key <= rootCert
    roleCert: _network/_role/(personName|(department/personName))/_key <= rootCert
    adminCert: roleCert & { _role: "admin" }
    userCert: roleCert & { _role: "user" }
    adminCommand: #command <= adminCert
    userCommand: #command & ({ verb: "ping" } | { target: "local" })
    #command: _network/_topic/target/verb/params/_commandTime &
      { _topic: "command", _commandTime: timestamp() }
    userCommand <= userCert
    reply <= deviceCert
    reply: replace(#command, _topic, "reply")/deviceName/_replyTime & { _replyTime: timestamp() }
    _key: "KEY"/_/_/_
  `);
  expect(versec2021.load(versec2021.print(policy))).toBeInstanceOf(TrustSchemaPolicy);

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

  expect(() => versec2021.load(`
    s: "a"
    s: "b"
  `)).toThrow(/duplicate definition/);
  expect(() => versec2021.load("s: s")).toThrow(/cyclic dependency/);
  expect(() => versec2021.load("s: timestamp(\"a\")")).toThrow(/timestamp\(.*arguments/);
  expect(() => versec2021.load("s: replace()")).toThrow(/replace\(.*arguments/);
  expect(() => versec2021.load("s: a/sysid(\"b\")")).toThrow(/sysid\(.*arguments/);
});

test("replace", () => {
  const policy = versec2021.load(`
    a: _b/_c
    _c: "C"

    d: a & { _b: "D" }
    e: d & { _b: "E" }
    f: replace(d, _b, "F")

    g: replace(a, _b, "G")
    h: g & { _b: "H" }
    i: replace(g, _b, "I")
  `);

  const checkPatternName = (id: string, name: NameLike): void => {
    const names = Array.from(policy.getPattern(id).build());
    expect(names).toHaveLength(1);
    expect(names[0]).toEqualName(name);
  };

  checkPatternName("d", "/D/C");
  expect(Array.from(policy.getPattern("e").build())).toHaveLength(0);
  checkPatternName("f", "/F/C");

  checkPatternName("g", "/G/C");
  checkPatternName("h", "/G/C");
  checkPatternName("i", "/G/C");
});
