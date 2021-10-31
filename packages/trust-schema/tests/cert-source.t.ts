import "@ndn/packet/test-fixture/expect";

import { Endpoint } from "@ndn/endpoint";
import { Certificate, generateSigningKey, KeyChain, NamedSigner, NamedVerifier, ValidityPeriod } from "@ndn/keychain";
import { Name, NameLike } from "@ndn/packet";
import { makeRepoProducer } from "@ndn/repo/test-fixture/data-store";
import { setTimeout as delay } from "node:timers/promises";
import { collect } from "streaming-iterables";

import { CertFetcher, CertSource, KeyChainCertSource, TrustAnchorContainer } from "..";

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

async function findIn(c: CertSource, name: NameLike | { name: Name }): Promise<Certificate[]> {
  if (typeof name === "object" && !(name instanceof Name)) {
    name = name.name;
  }
  return collect(c.findCerts(new Name(name)));
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
  let consumeFn: jest.SpyInstance<ReturnType<Endpoint["consume"]>, Parameters<Endpoint["consume"]>>;
  let producer: makeRepoProducer.Result;
  let fetcher0: CertFetcher;
  let fetcher1: CertFetcher;
  beforeEach(async () => {
    endpoint = new Endpoint();
    consumeFn = jest.spyOn(endpoint, "consume");
    producer = await makeRepoProducer([certB.data]);
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
  });
  afterEach(() => {
    producer.close();
    Endpoint.deleteDefaultForwarder();
  });

  test("positive", async () => {
    let found = await findIn(fetcher0, pubB);
    expect(found).toHaveLength(1);
    expect(found[0]).toHaveName(certB.name);
    expect(consumeFn).toHaveBeenCalledTimes(1);
    expect(consumeFn.mock.results[0]!.type).toBe("return");
    if (consumeFn.mock.results[0]!.type === "return") {
      const { interest } = consumeFn.mock.results[0]!.value;
      expect(interest).toHaveName(pubB.name);
      expect(interest.canBePrefix).toBeTruthy();
      expect(interest.mustBeFresh).toBeTruthy();
    }

    found = await findIn(fetcher1, certB);
    expect(found).toHaveLength(1);
    expect(found[0]).toHaveName(certB.name);
    expect(consumeFn).toHaveBeenCalledTimes(1); // cached positive response

    await delay(300); // cache expired

    found = await findIn(fetcher1, certB);
    expect(found).toHaveLength(1);
    expect(found[0]).toHaveName(certB.name);
    expect(consumeFn).toHaveBeenCalledTimes(2);
    expect(consumeFn.mock.results[1]!.type).toBe("return");
    if (consumeFn.mock.results[1]!.type === "return") {
      const { interest } = consumeFn.mock.results[1]!.value;
      expect(interest).toHaveName(certB.name);
      expect(interest.canBePrefix).toBeFalsy();
      expect(interest.mustBeFresh).toBeFalsy();
    }

    found = await findIn(fetcher0, pubB);
    expect(found).toHaveLength(1);
    expect(found[0]).toHaveName(certB.name);
    expect(consumeFn).toHaveBeenCalledTimes(2); // cached positive response
  });

  test("negative", async () => {
    let found = await findIn(fetcher0, pubA);
    expect(found).toHaveLength(0);
    expect(consumeFn).toHaveBeenCalledTimes(1); // retx is handled within endpoint.consume()

    found = await findIn(fetcher1, pubA);
    expect(found).toHaveLength(0);
    expect(consumeFn).toHaveBeenCalledTimes(1); // cached negative response

    await delay(300); // cache expired

    found = await findIn(fetcher1, pubA);
    expect(found).toHaveLength(0);
    expect(consumeFn).toHaveBeenCalledTimes(2);
  });
});
