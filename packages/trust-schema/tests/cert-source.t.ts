import "@ndn/packet/test-fixture/expect";

import { Endpoint } from "@ndn/endpoint";
import { Certificate, EcPrivateKey, KeyChain, PrivateKey, PublicKey, ValidityPeriod } from "@ndn/keychain";
import { Name, NameLike } from "@ndn/packet";
import { makeRepoProducer } from "@ndn/repo/test-fixture/data-store";
import { collect } from "streaming-iterables";

import { CertFetcher, CertSource, KeyChainCertSource, TrustAnchorContainer } from "..";

let keyChain: KeyChain;
let pvtA: PrivateKey;
let pubA: PublicKey;
let selfA: Certificate;
let pvtB: PrivateKey;
let pubB: PublicKey;
let selfB: Certificate;
let certB: Certificate;

beforeAll(async () => {
  keyChain = KeyChain.createTemp();
  [pvtA, pubA] = await EcPrivateKey.generate("/A", "P-256", keyChain);
  selfA = await Certificate.selfSign({ publicKey: pubA, privateKey: pvtA });
  await keyChain.insertCert(selfA);
  [pvtB, pubB] = await EcPrivateKey.generate("/B", "P-256", keyChain);
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
  let producer: any; // TODO awaited ReturnType<typeof makeRepoProducer>
  let fetcher0: CertFetcher;
  let fetcher1: CertFetcher;
  beforeEach(async () => {
    endpoint = new Endpoint();
    consumeFn = jest.spyOn(endpoint, "consume");
    producer = await makeRepoProducer([certB.data]);
    fetcher0 = new CertFetcher({
      interestLifetime: 50,
      endpoint,
      positiveTtl: 300,
      negativeTtl: 300,
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
    let interest = consumeFn.mock.calls[0][0];
    expect(interest).toHaveName(pubB.name);
    expect(interest.canBePrefix).toBeTruthy();
    expect(interest.mustBeFresh).toBeTruthy();

    found = await findIn(fetcher1, certB);
    expect(found).toHaveLength(1);
    expect(found[0]).toHaveName(certB.name);
    expect(consumeFn).toHaveBeenCalledTimes(1); // cached positive response

    await new Promise((r) => setTimeout(r, 300)); // cache expired

    found = await findIn(fetcher1, certB);
    expect(found).toHaveLength(1);
    expect(found[0]).toHaveName(certB.name);
    expect(consumeFn).toHaveBeenCalledTimes(2);
    interest = consumeFn.mock.calls[1][0];
    expect(interest).toHaveName(certB.name);
    expect(interest.canBePrefix).toBeFalsy();
    expect(interest.mustBeFresh).toBeFalsy();

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

    await new Promise((r) => setTimeout(r, 300)); // cache expired

    found = await findIn(fetcher1, pubA);
    expect(found).toHaveLength(0);
    expect(consumeFn).toHaveBeenCalledTimes(2);
  });
});
