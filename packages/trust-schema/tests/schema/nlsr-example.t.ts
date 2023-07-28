import "@ndn/packet/test-fixture/expect";

import { Certificate, CertNaming, generateSigningKey, KeyChain, type NamedSigner, ValidityPeriod } from "@ndn/keychain";
import { Component, Data, type Name } from "@ndn/packet";
import { collect, take } from "streaming-iterables";
import { beforeAll, expect, test } from "vitest";

import { pattern as P, printESM, TrustSchema, type TrustSchemaPolicy, TrustSchemaSigner, versec } from "../..";

const NLSR_POLICY = `
// adapted from https://pollere.net/Pdfdocs/BuildingBridge.pdf

_net: "ndn"
_site: "edu"/"ucla"
_operator: "_operator"/opId
_rtr: "Router"/rtrName
hello: _net/nsite/nrtr/"nlsr"/"INFO"/_rtr/version
_discovery: seqNo
_segment: seqNo/version/segmentNo
lsa: "localhop"/_net/"nlsr"/"LSA"/_site/_rtr/type/(_discovery|_segment)
packet: hello | lsa
netCert: _net/"KEY"/_/_/_
siteCert: _net/_site/"KEY"/_/_/_
opCert: _net/_site/_operator/"KEY"/_/_/_
rtrCert: _net/_site/_rtr/"KEY"/_/_/_
nlsrCert: _net/_site/_rtr/"nlsr"/"KEY"/_/_/_
packet <= nlsrCert <= rtrCert <= opCert <= siteCert <= netCert
`;

let policy: TrustSchemaPolicy;
let trustAnchor: Certificate;
let trustAnchorPvt: NamedSigner.PrivateKey;

interface NameVars {
  name: Name;
  cert: Name;
  vars: P.VarsLike;
}
let hello: NameVars;
let lsa: NameVars;
let nlsrCert: NameVars;
let nlsrCert1: NameVars;
let rtrCert: NameVars;
let opCert: NameVars;
let siteCert: NameVars;
let netCert: NameVars;

beforeAll(async () => {
  policy = versec.load(NLSR_POLICY);

  const certSuffix = [CertNaming.KEY, "key-id", "issuer-id", "cert-version"];
  function buildName(id: string, vars: P.VarsLike): NameVars {
    const [name] = collect(take(1, policy.getPattern(id).build(vars)));
    if (!name) {
      throw new Error(`${id}.build(${JSON.stringify(vars)}) is empty`);
    }
    return { name, cert: name.append(...certSuffix), vars };
  }

  hello = buildName("hello", {
    nsite: "arizona",
    nrtr: "hobo",
    rtrName: "suns",
    version: "v1",
  });
  lsa = buildName("lsa", {
    rtrName: "suns",
    type: "name",
    seqNo: "seq1",
  });
  nlsrCert = buildName("nlsrCert", {
    rtrName: "suns",
  });
  nlsrCert1 = buildName("nlsrCert", {
    rtrName: "hobo",
  });
  rtrCert = buildName("rtrCert", {
    rtrName: "suns",
  });
  opCert = buildName("opCert", {
    opId: "jdd",
  });
  siteCert = buildName("siteCert", {});
  netCert = buildName("netCert", {});

  const [netPvt, netPub] = await generateSigningKey(netCert.name);
  trustAnchor = await Certificate.selfSign({ publicKey: netPub, privateKey: netPvt });
  trustAnchorPvt = netPvt;
  netCert.cert = trustAnchor.name;
});

test("print", () => {
  expect(versec.print(policy)).toMatch(/: /);
  expect(printESM(policy)).toMatch(/policy\.addPattern/);
});

test("classify", () => {
  expect(hello.name).toEqualName("/ndn/arizona/hobo/nlsr/INFO/Router/suns/v1");
  let m = policy.match(hello.name);
  expect(new Set(m.map(({ id }) => id))).toEqual(new Set(["hello", "packet"]));
  for (const [k, v] of P.VarsLike.toIterable(hello.vars)) {
    expect(m[0]!.vars.get(k)).toEqualName(v);
  }

  expect(lsa.name).toEqualName("/localhop/ndn/nlsr/LSA/edu/ucla/Router/suns/name/seq1");
  m = policy.match(lsa.name);
  expect(new Set(m.map(({ id }) => id))).toEqual(new Set(["lsa", "packet"]));
  for (const [k, v] of P.VarsLike.toIterable(lsa.vars)) {
    expect(m[0]!.vars.get(k)).toEqualName(v);
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

function buildSignerNames(...args: Parameters<TrustSchemaPolicy["buildSignerNames"]>) {
  return Array.from(policy.buildSignerNames(...args));
}

test("buildSignerNames", () => {
  let b = buildSignerNames(hello.name);
  expect(b).toHaveLength(1);
  expect(b[0]).toEqualName(nlsrCert.name);

  const lsaClassified = policy.match(lsa.name);
  b = buildSignerNames(lsaClassified);
  expect(b).toHaveLength(1);
  expect(b[0]).toEqualName(nlsrCert.name);

  b = buildSignerNames(nlsrCert.cert);
  expect(b).toHaveLength(1);
  expect(b[0]).toEqualName(rtrCert.name);

  expect(buildSignerNames(rtrCert.cert)).toHaveLength(0); // missing opId

  b = buildSignerNames(rtrCert.cert, opCert.vars);
  expect(b).toHaveLength(1);
  expect(b[0]).toEqualName(opCert.name);

  b = buildSignerNames(opCert.cert);
  expect(b).toHaveLength(1);
  expect(b[0]).toEqualName(siteCert.name);

  b = buildSignerNames(siteCert.cert);
  expect(b).toHaveLength(1);
  expect(b[0]).toEqualName(netCert.name);
});

test("signer", async () => {
  const keyChain = KeyChain.createTemp();

  const [, sitePub] = await generateSigningKey(keyChain, siteCert.name);
  const siteCertificate = await Certificate.issue({
    publicKey: sitePub,
    issuerPrivateKey: trustAnchorPvt,
    validity: ValidityPeriod.daysFromNow(1),
    issuerId: Component.from("I"),
  });
  await keyChain.insertCert(siteCertificate);

  const schema = new TrustSchema(policy, [trustAnchor]);
  const signer = new TrustSchemaSigner({ keyChain, schema });

  async function issueCertificate({ name: subject }: NameVars, expectIssuer: Name): Promise<Name> {
    const [, pub] = await generateSigningKey(keyChain, subject);
    const cert = await Certificate.issue({
      publicKey: pub,
      issuerPrivateKey: await signer.findSigner(pub.name),
      validity: ValidityPeriod.daysFromNow(1),
      issuerId: Component.from("I"),
    });
    expect(cert.issuer).toEqualName(expectIssuer);
    await keyChain.insertCert(cert);
    return cert.name;
  }

  const opCertName = await issueCertificate(opCert, siteCertificate.name);
  const rtrCertName = await issueCertificate(rtrCert, opCertName);
  const nlsrCertName = await issueCertificate(nlsrCert, rtrCertName);

  const lsaData = new Data(lsa.name);
  await signer.sign(lsaData);
  expect(lsaData.sigInfo.keyLocator).toHaveName(nlsrCertName);

  const unrelatedData = new Data("/U");
  await expect(signer.sign(unrelatedData)).rejects.toThrow(/no signer/);
});
