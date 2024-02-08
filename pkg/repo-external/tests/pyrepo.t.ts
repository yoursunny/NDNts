import { afterEach } from "node:test";

import { Endpoint } from "@ndn/endpoint";
import { Forwarder } from "@ndn/fw";
import { Segment } from "@ndn/naming-convention2";
import { Data, digestSigning, Name } from "@ndn/packet";
import { makeTmpDir } from "@ndn/util/test-fixture/tmpfile";
import { expect, test } from "vitest";

import { PyRepoStore } from "..";
import { PyRepo } from "../test-fixture/pyrepo";

afterEach(Forwarder.deleteDefault);

test.runIf(PyRepo.supported)("workflow", async () => {
  using tmpDir = makeTmpDir();
  await using repo = await PyRepo.create("/myrepo", { dir: tmpDir.name });

  const store = new PyRepoStore({
    repoPrefix: new Name("/myrepo"),
    combineRange: true,
  });
  const endpoint = new Endpoint({
    modifyInterest: { lifetime: 500 },
    retx: 1,
  });

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
  const pkts = await Promise.all(Array.from(names, async (name) => {
    const data = new Data(name);
    data.freshnessPeriod = 1;
    await digestSigning.sign(data);
    return data;
  }));

  const countRetrievable = async () => {
    const retrieved = await Promise.allSettled(Array.from(names, (name) => endpoint.consume(name)));
    return retrieved.filter(({ status }) => status === "fulfilled").length;
  };

  await store.insert(pkts);
  await expect(countRetrievable()).resolves.toBeGreaterThanOrEqual(names.length * 0.8);

  await store.delete(...names);
  await expect(countRetrievable()).resolves.toBe(0);
}, { timeout: 30000 });
