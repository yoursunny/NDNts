import "@ndn/packet/test-fixture/expect";

import { Endpoint } from "@ndn/endpoint";
import { Certificate, generateSigningKey, KeyChain, type NamedSigner, type NamedVerifier } from "@ndn/keychain";
import { Name, type NameLike, ValidityPeriod } from "@ndn/packet";
import { makeRepoProducer } from "@ndn/repo/test-fixture/producer";
import { delay } from "@ndn/util";
import { collect } from "streaming-iterables";
import { beforeAll, beforeEach, describe, expect, type MockInstance, test, vi } from "vitest";

import { CertFetcher, type CertSource, CertSources, KeyChainCertSource, TrustAnchorContainer } from "..";

let keyChain: KeyChain;
let pvtA: NamedSigner.PrivateKey;
let pubA: NamedVerifier.PublicKey;
let selfA: Certificate;
let pvtB: NamedSigner.PrivateKey;
let pubB: NamedVerifier.PublicKey;
let selfB: Certificate;
let certB: Certificate;

beforeAll(async () => {
  keyChain = KeyChain.createTemp();
  [pvtA, pubA] = await generateSigningKey(keyChain, "/A");
  selfA = await Certificate.selfSign({ publicKey: pubA, privateKey: pvtA });
  await keyChain.insertCert(selfA);
  [pvtB, pubB] = await generateSigningKey(keyChain, "/B");
  selfB = await Certificate.selfSign({ publicKey: pubB, privateKey: pvtB });
  await keyChain.insertCert(selfB);
  certB = await Certificate.issue({
    publicKey: pubB,
    issuerPrivateKey: pvtA,
    validity: ValidityPeriod.daysFromNow(1),
    issuerId: pvtA.name.at(0),
  });
  await keyChain.insertCert(certB);
});

function findIn(c: CertSource, name: NameLike | { name: Name }): Promise<Certificate[]> {
  if (typeof name === "object" && !(name instanceof Name)) {
    name = name.name;
  }
  return collect(c.findCerts(Name.from(name)));
}

test("TrustAnchorContainer", async () => {
  const c = new TrustAnchorContainer([selfA]);
  expect(c.has(selfA)).toBeTruthy();
  expect(c.has(selfB)).toBeFalsy();

  c.remove(selfA);
  c.add(selfB);
  expect(c.has(selfA)).toBeFalsy();
  expect(c.has(selfB)).toBeTruthy();

  c.add(selfB);
  await expect(findIn(c, pubB)).resolves.toHaveLength(1);
  await expect(findIn(c, certB)).resolves.toHaveLength(0);
  c.add(certB);
  await expect(findIn(c, pubB)).resolves.toHaveLength(2);
  await expect(findIn(c, certB)).resolves.toHaveLength(1);
});

test("KeyChainCertSource", async () => {
  const c = new KeyChainCertSource(keyChain);

  let found = await findIn(c, pubA);
  expect(found).toHaveLength(1);
  expect(found[0]).toHaveName(selfA.name);

  found = await findIn(c, pubB);
  expect(found).toHaveLength(2);
  expect(new Set(found.map(({ name }) => name.toString())))
    .toStrictEqual(new Set([selfB, certB].map(({ name }) => name.toString())));

  found = await findIn(c, certB);
  expect(found).toHaveLength(1);
  expect(found[0]).toHaveName(certB.name);

  found = await findIn(c, "/C");
  expect(found).toHaveLength(0);
});

describe("CertFetcher", () => {
  let endpoint: Endpoint;
  let consumeFn: MockInstance<Parameters<Endpoint["consume"]>, ReturnType<Endpoint["consume"]>>;
  let fetcher0: CertFetcher;
  let fetcher1: CertFetcher;
  beforeEach(async () => {
    endpoint = new Endpoint();
    consumeFn = vi.spyOn(endpoint, "consume");
    const producer = await makeRepoProducer({}, [certB.data]);
    fetcher0 = new CertFetcher({
      interestLifetime: 50,
      endpoint,
      positiveTtl: 200,
      negativeTtl: 200,
    });
    fetcher1 = new CertFetcher({
      interestLifetime: 50,
      endpoint, // same Endpoint, sharing cache
    });
    return () => {
      producer.close();
      Endpoint.deleteDefaultForwarder();
    };
  });

  test("positive", async () => {
    let found = await findIn(fetcher0, pubB);
    expect(found).toHaveLength(1);
    expect(found[0]).toHaveName(certB.name);
    expect(consumeFn).toHaveBeenCalledTimes(1);

    found = await findIn(fetcher1, certB);
    expect(found).toHaveLength(1);
    expect(found[0]).toHaveName(certB.name);
    expect(consumeFn).toHaveBeenCalledTimes(1); // cached positive response

    await delay(300); // cache expired

    found = await findIn(fetcher1, certB);
    expect(found).toHaveLength(1);
    expect(found[0]).toHaveName(certB.name);
    expect(consumeFn).toHaveBeenCalledTimes(2);

    found = await findIn(fetcher0, pubB);
    expect(found).toHaveLength(1);
    expect(found[0]).toHaveName(certB.name);
    expect(consumeFn).toHaveBeenCalledTimes(2); // cached positive response
  });

  test("negative", async () => {
    let found = await findIn(fetcher0, pubA);
    expect(found).toHaveLength(0);
    expect(consumeFn).toHaveBeenCalledTimes(1);

    found = await findIn(fetcher1, pubA);
    expect(found).toHaveLength(0);
    expect(consumeFn).toHaveBeenCalledTimes(1); // cached negative response

    await delay(300); // cache expired

    found = await findIn(fetcher1, pubA);
    expect(found).toHaveLength(0);
    expect(consumeFn).toHaveBeenCalledTimes(2);
  });
});

describe("CertSources", () => {
  let keyChainGetCertFn: MockInstance<Parameters<KeyChain["getCert"]>, ReturnType<KeyChain["getCert"]>>;
  beforeEach(() => {
    keyChainGetCertFn = vi.spyOn(keyChain, "getCert");
    return () => {
      keyChainGetCertFn.mockRestore();
    };
  });

  test("TrustAnchor-KeyChain", async () => {
    const s = new CertSources({
      trustAnchors: [selfA],
      keyChain,
      offline: true,
    });

    let found = await findIn(s, selfA);
    expect(found).toHaveLength(1);
    expect(keyChainGetCertFn).toHaveBeenCalledTimes(0);

    found = await findIn(s, certB);
    expect(found).toHaveLength(1);
    expect(keyChainGetCertFn).toHaveBeenCalledTimes(1);
  });
});
