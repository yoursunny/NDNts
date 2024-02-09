import { Endpoint } from "@ndn/endpoint";
import { FakeNfd } from "@ndn/nfdmgmt/test-fixture/prefix-reg";
import { Name } from "@ndn/packet";
import { FullSync, makePSyncCompatParam, type SyncUpdate } from "@ndn/psync";
import { Closers, delay } from "@ndn/util";
import { afterEach, expect, test, vi } from "vitest";

import { execute } from "../../../test-fixture/cxxprogram";

const syncPrefix = new Name("/sync");
const userA = new Name("/userA");
const userB = new Name("/userB");
const userC = new Name("/userC");

const closers = new Closers();
afterEach(closers.close);

test("simple", async () => {
  await using nfd = await new FakeNfd().open();

  const p = execute(import.meta.url, [`${nfd.port}`, `${syncPrefix}`, `${userA}`]);
  await nfd.waitNFaces(1);

  const sync = new FullSync({
    endpoint: new Endpoint({ fw: nfd.fw }),
    p: makePSyncCompatParam({
      expectedEntries: 30,
    }),
    syncPrefix,
    syncInterestLifetime: 100,
    syncReplyFreshness: 500,
  });
  closers.push(sync);

  const handleUpdate = vi.fn<[SyncUpdate<Name>], void>();
  sync.addEventListener("update", handleUpdate);

  p.kill("SIGUSR1");
  await delay(1500);
  expect(handleUpdate).toHaveBeenCalledTimes(1);
  expect(sync.get(userA)?.seqNum).toBe(1);

  const nodeB = sync.add(userB);
  nodeB.seqNum = 6;
  const nodeC = sync.add(userC);
  nodeC.seqNum = 1;
  await delay(1500);

  p.kill("SIGINT");
  const { stdout } = await p;
  const hiSeqNums = new Map<string, number>();
  for (const line of stdout.split("\n")) {
    const [user, , hiSeqNum] = line.split("\t") as [string, string, string];
    hiSeqNums.set(user, Number.parseInt(hiSeqNum, 10));
  }
  expect(hiSeqNums.get(`${userB}`)).toBe(6);
  expect(hiSeqNums.get(`${userC}`)).toBe(1);
});
