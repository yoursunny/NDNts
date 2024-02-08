import { afterEach } from "node:test";

import { Endpoint } from "@ndn/endpoint";
import { Forwarder } from "@ndn/fw";
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
  });
  const endpoint = new Endpoint({
    modifyInterest: { lifetime: 500 },
    retx: 1,
  });

  const names = Array.from({ length: 10 }, (item, i) => {
    void item;
    return new Name(`/A/${i}`);
  });
  const pkts = await Promise.all(Array.from(names, async (name) => {
    const data = new Data(name);
    data.freshnessPeriod = 1;
    await digestSigning.sign(data);
    return data;
  }));

  await store.insert(pkts);

  const r0 = await Promise.allSettled(Array.from(names, (name) => endpoint.consume(name)));
  expect(r0.filter(({ status }) => status === "fulfilled").length)
    .toBeGreaterThanOrEqual(names.length * 0.8);

  await store.delete(...names);

  const r1 = await Promise.allSettled(Array.from(names, (name) => endpoint.consume(name)));
  expect(r1.filter(({ status }) => status === "fulfilled")).toHaveLength(0);
}, { timeout: 30000 });
