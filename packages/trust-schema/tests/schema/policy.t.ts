import "@ndn/packet/test-fixture/expect";

import { CertNaming } from "@ndn/keychain";
import { NameLike } from "@ndn/packet";

import { versec2019 } from "../..";

describe("NLSR policy example", () => {
  const policy = versec2019.load(`
# adapted from https://pollere.net/Pdfdocs/BuildingBridge.pdf

net = ndn
site = edu/ucla
# <opId> changed to <_opId>
operator = Operator/<_opId>
# <rtrName> changed to <_rtrName>
rtr = Router/<_rtrName>
# <_rtr> changed to <rtr>
hello = <net>/<_nsite>/<_nrtr>/nlsr/INFO/<rtr>/<_version>
discovery = <_seqNo>
segment = <_seqNo>/<_version>/<_segmentNo>
lsa = localhop/<net>/nlsr/LSA/<site>/<rtr>/<_type>/(<discovery>|<segment>)
packet = <hello> | <lsa>
netCert = <net>/<_KEY>
siteCert = <net>/<site>/<_KEY>
opCert = <net>/<site>/<operator>/<_KEY>
rtrCert = <net>/<site>/<rtr>/<_KEY>
nlsrCert = <net>/<site>/<rtr>/nlsr/<_KEY>
packet <= nlsrCert <= rtrCert <= opCert <= siteCert <= netCert
  `);

  function buildName<T extends Record<string, NameLike>>(id: string, vars: T) {
    const name = policy.getPattern(id).build(vars);
    return { name, cert: name.append(...certSuffix), vars };
  }
  const certSuffix = [CertNaming.KEY, "key-id", "issuer-id", "cert-version"];

  const hello = buildName("hello", {
    nsite: "/arizona",
    nrtr: "/hobo",
    rtrName: "/suns",
    version: "/v1",
  });
  const lsa = buildName("lsa", {
    rtrName: "/suns",
    type: "/name",
    seqNo: "/seq1",
  });
  const nlsrCert = buildName("nlsrCert", {
    rtrName: "/suns",
  });
  const nlsrCert1 = buildName("nlsrCert", {
    rtrName: "/hobo",
  });
  const rtrCert = buildName("rtrCert", {
    rtrName: "/suns",
  });
  const opCert = buildName("opCert", {
    opId: "/jdd",
  });
  const siteCert = buildName("siteCert", {});
  const netCert = buildName("netCert", {});

  test("print", () => {
    expect(versec2019.print(policy)).toMatch(/ = /);
  });

  test("classify", () => {
    expect(hello.name).toEqualName("/ndn/arizona/hobo/nlsr/INFO/Router/suns/v1");
    let m = policy.match(hello.name);
    expect(new Set(m.map(({ id }) => id))).toEqual(new Set(["hello", "packet"]));
    for (const [k, v] of Object.entries(hello.vars)) {
      expect(m[0].vars[k]).toEqualName(v);
    }

    expect(lsa.name).toEqualName("/localhop/ndn/nlsr/LSA/edu/ucla/Router/suns/name/seq1");
    m = policy.match(lsa.name);
    expect(new Set(m.map(({ id }) => id))).toEqual(new Set(["lsa", "packet"]));
    for (const [k, v] of Object.entries(lsa.vars)) {
      expect(m[0].vars[k]).toEqualName(v);
    }

    m = policy.match(nlsrCert.cert);
    expect(new Set(m.map(({ id }) => id))).toEqual(new Set(["nlsrCert"]));
  });

  test("canSign", () => {
    expect(policy.canSign(hello.name, nlsrCert.cert)).toBeTruthy();
    expect(policy.canSign(lsa.name, nlsrCert.cert)).toBeTruthy();
    expect(policy.canSign(nlsrCert.cert, rtrCert.cert)).toBeTruthy();
    expect(policy.canSign(rtrCert.cert, opCert.cert)).toBeTruthy();
    expect(policy.canSign(opCert.cert, siteCert.cert)).toBeTruthy();
    expect(policy.canSign(siteCert.cert, netCert.cert)).toBeTruthy();

    expect(policy.canSign(hello.name, nlsrCert1.cert)).toBeFalsy();
    expect(policy.canSign(nlsrCert.cert, opCert.cert)).toBeFalsy();
    expect(policy.canSign(rtrCert.cert, siteCert.cert)).toBeFalsy();
  });

  test("getSignerName", () => {
    expect(policy.getSignerName(hello.name)).toEqualName(nlsrCert.name);
    const lsaClassified = policy.match(lsa.name);
    expect(policy.getSignerName(lsaClassified)).toEqualName(nlsrCert.name);

    expect(policy.getSignerName(nlsrCert.cert)).toEqualName(rtrCert.name);
    expect(() => policy.getSignerName(rtrCert.cert)).toThrow(); // need opId
    expect(policy.getSignerName(rtrCert.cert, opCert.vars)).toEqualName(opCert.name);
    expect(policy.getSignerName(opCert.cert)).toEqualName(siteCert.name);
    expect(policy.getSignerName(siteCert.cert)).toEqualName(netCert.name);
  });
});
