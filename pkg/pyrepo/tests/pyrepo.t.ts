import { afterEach } from "node:test";

import { consume, type ConsumerOptions, produce } from "@ndn/endpoint";
import { Forwarder } from "@ndn/fw";
import { Certificate, CertNaming, generateSigningKey } from "@ndn/keychain";
import { Segment } from "@ndn/naming-convention2";
import { Component, Data, digestSigning, Name, type Signer, ValidityPeriod } from "@ndn/packet";
import { ReadFromNetwork } from "@ndn/repo-api";
import { testDataStoreBasic } from "@ndn/repo-api/test-fixture/data-store";
import { Closers, delay } from "@ndn/util";
import { makeTmpDir } from "@ndn/util/test-fixture/tmp";
import { parallelMap } from "streaming-iterables";
import { beforeEach, expect, test } from "vitest";

import { PyRepoStore } from "..";
import { PyRepo } from "../test-fixture/pyrepo";

let trustAnchorCert: Certificate;
let ingestProducerSigner: Signer;
let ingestProducerCert: Certificate;

const closers = new Closers();
beforeEach(async () => {
  const tmpDir = makeTmpDir();
  closers.push(tmpDir);

  const [trustAnchorPvt, trustAnchorPub] = await generateSigningKey("/T");
  trustAnchorCert = await Certificate.selfSign({
    privateKey: trustAnchorPvt,
    publicKey: trustAnchorPub,
  });
  const [producerPvt, producerPub] = await generateSigningKey("/P");
  ingestProducerCert = await Certificate.issue({
    issuerPrivateKey: trustAnchorPvt.withKeyLocator(trustAnchorCert.name),
    publicKey: producerPub,
    validity: ValidityPeriod.daysFromNow(1),
    issuerId: Component.from("T"),
  });
  ingestProducerSigner = producerPvt.withKeyLocator(ingestProducerCert.name);
  closers.push(produce(CertNaming.toKeyName(ingestProducerCert.name), () => ingestProducerCert.data));

  const repo = await PyRepo.create("/myrepo", {
    dir: tmpDir.name,
    trustAnchorCert,
    ingestProducerCert,
  });
  closers.push(repo);
});
afterEach(() => {
  closers.close();
  Forwarder.deleteDefault();
});

function makePyRepoStore(useIngest = false): PyRepoStore {
  return new PyRepoStore({
    repoPrefix: new Name("/myrepo"),
    combineRange: true,
    useIngest,
    ingestSigner: ingestProducerSigner,
  });
}

const cOpts: ConsumerOptions = {
  modifyInterest: { lifetime: 500 },
  retx: 1,
};

test.runIf(PyRepo.supported)("basic", { timeout: 30000, retry: 2 }, async () => {
  const store = makePyRepoStore();
  const readable = new ReadFromNetwork(cOpts).mix(store);
  await testDataStoreBasic(readable);
});

test.runIf(PyRepo.supported).each([false, true])("workflow ingest=%s", { timeout: 30000, retry: 1 }, async (useIngest) => {
  const store = makePyRepoStore(useIngest);
  const names = Array.from({ length: 200 }, (_item, i) => {
    if (i < 100) {
      return new Name("/A").append(Segment, i);
    }
    if (i >= 120) {
      return new Name("/B").append(Segment, i);
    }
    return new Name(`/Z/${i}`);
  });

  const countRetrievable = async () => {
    const retrieved = await Promise.allSettled(Array.from(names, (name) => consume(name, cOpts)));
    return retrieved.filter(({ status }) => status === "fulfilled").length;
  };

  await store.insert(parallelMap(Infinity, async (name) => {
    const data = new Data(name);
    await digestSigning.sign(data);
    return data;
  }, names));
  await expect(countRetrievable()).resolves.toBeGreaterThanOrEqual(names.length * 0.8);

  await delay(1000);
  await store.delete(...names);
  await expect(countRetrievable()).resolves.toBe(0);
});
