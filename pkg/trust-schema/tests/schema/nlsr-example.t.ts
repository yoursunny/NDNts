import "@ndn/packet/test-fixture/expect";

import { Certificate, CertNaming, generateSigningKey, KeyChain, type NamedSigner } from "@ndn/keychain";
import { Segment, SequenceNum, Version } from "@ndn/naming-convention2";
import { Component, Data, Name, ValidityPeriod } from "@ndn/packet";
import take from "obliterator/take.js";
import { beforeAll, expect, test } from "vitest";

import { pattern as P, printESM, TrustSchema, TrustSchemaPolicy, TrustSchemaSigner } from "../..";

function buildPolicy() {
  // adapted from https://pollere.net/Pdfdocs/BuildingBridge.pdf page 14
  const policy = new TrustSchemaPolicy();

  const net = new P.ConstPattern("/ndn");
  const site = new P.ConstPattern("/edu/ucla");

  const operator = new P.ConcatPattern([new P.ConstPattern("/Operator"), new P.VariablePattern("opId")]);
  const rtr = new P.ConcatPattern([new P.ConstPattern("/Router"), new P.VariablePattern("rtrName")]);

  const hello = new P.ConcatPattern([
    net, new P.VariablePattern("nsite"), new P.VariablePattern("nrtr"),
    new P.ConstPattern("/nlsr/INFO"), rtr,
    new P.VariablePattern("version", { filter: new P.VariablePattern.ConventionFilter(Version) }),
  ]);

  const discover = new P.VariablePattern("seqNo");
  const segment = new P.ConcatPattern([
    new P.VariablePattern("seqNo"),
    new P.VariablePattern("version", { filter: new P.VariablePattern.ConventionFilter(Version) }),
    new P.VariablePattern("segmentNo", { filter: new P.VariablePattern.ConventionFilter(Segment) }),
  ]);
  const lsa = new P.ConcatPattern([
    new P.ConstPattern("/localhop"), net, new P.ConstPattern("/nlsr/LSA"), site, rtr,
    new P.VariablePattern("type"), new P.AlternatePattern([discover, segment]),
  ]);

  policy.addPattern("hello", hello);
  policy.addPattern("lsa", lsa);
  policy.addPattern("packet", new P.AlternatePattern([hello, lsa]));
  policy.addPattern("netCert", new P.ConcatPattern([net, new P.CertNamePattern()]));
  policy.addPattern("siteCert", new P.ConcatPattern([net, site, new P.CertNamePattern()]));
  policy.addPattern("opCert", new P.ConcatPattern([net, site, operator, new P.CertNamePattern()]));
  policy.addPattern("rtrCert", new P.ConcatPattern([net, site, rtr, new P.CertNamePattern()]));
  policy.addPattern("nlsrCert", new P.ConcatPattern([
    net, site, rtr, new P.ConstPattern("/nlsr"), new P.CertNamePattern(),
  ]));

  policy.addRule("packet", "nlsrCert");
  policy.addRule("nlsrCert", "rtrCert");
  policy.addRule("rtrCert", "opCert");
  policy.addRule("opCert", "siteCert");
  policy.addRule("siteCert", "netCert");

  return policy;
}

const policy = buildPolicy();
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
  const certSuffix = [CertNaming.KEY, "key-id", "issuer-id", "cert-version"];
  function buildName(id: string, vars: P.VarsLike): NameVars {
    const [name] = take(policy.getPattern(id).build(vars), 1);
    if (!name) {
      throw new Error(`${id}.build(${JSON.stringify(vars)}) is empty`);
    }
    return { name, cert: name.append(...certSuffix), vars };
  }

  hello = buildName("hello", {
    nsite: "arizona",
    nrtr: "hobo",
    rtrName: "suns",
    version: new Name().append(Version, 1),
  });
  lsa = buildName("lsa", {
    rtrName: "suns",
    type: "name",
    seqNo: new Name().append(SequenceNum, 1),
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
  expect(printESM(policy)).toMatch(/policy\.addPattern/);
});

test("classify", () => {
  expect(hello.name).toEqualName(new Name("/ndn/arizona/hobo/nlsr/INFO/Router/suns").append(Version, 1));
  let m = policy.match(hello.name);
  expect(new Set(m.map(({ id }) => id))).toEqual(new Set(["hello", "packet"]));
  for (const [k, v] of P.VarsLike.toIterable(hello.vars)) {
    expect(m[0]!.vars.get(k)).toEqualName(v);
  }

  expect(lsa.name).toEqualName(new Name("/localhop/ndn/nlsr/LSA/edu/ucla/Router/suns/name").append(SequenceNum, 1));
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
