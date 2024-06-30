import { afterEach } from "node:test";

import { consume, type ConsumerOptions } from "@ndn/endpoint";
import { Forwarder } from "@ndn/fw";
import { Segment } from "@ndn/naming-convention2";
import { Data, digestSigning, Name } from "@ndn/packet";
import { ReadFromNetwork } from "@ndn/repo-api";
import { testDataStoreBasic } from "@ndn/repo-api/test-fixture/data-store";
import { Closers, delay } from "@ndn/util";
import { makeTmpDir } from "@ndn/util/test-fixture/tmp";
import { parallelMap } from "streaming-iterables";
import { beforeEach, expect, test } from "vitest";

import { PyRepoStore } from "..";
import { PyRepo } from "../test-fixture/pyrepo";

const closers = new Closers();
let store: PyRepoStore;
beforeEach(async () => {
  const tmpDir = makeTmpDir();
  closers.push(tmpDir);
  const repo = await PyRepo.create("/myrepo", { dir: tmpDir.name });
  closers.push(repo);

  store = new PyRepoStore({
    repoPrefix: new Name("/myrepo"),
    combineRange: true,
  });
});
afterEach(() => {
  closers.close();
  Forwarder.deleteDefault();
});

const cOpts: ConsumerOptions = {
  modifyInterest: { lifetime: 500 },
  retx: 1,
};

test.runIf(PyRepo.supported)("basic", { timeout: 30000, retry: 2 }, async () => {
  const readable = new ReadFromNetwork(cOpts).mix(store);
  await testDataStoreBasic(readable);
});

test.runIf(PyRepo.supported)("workflow", { timeout: 30000, retry: 1 }, async () => {
  const names = Array.from({ length: 200 }, (item, i) => {
    void item;
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
