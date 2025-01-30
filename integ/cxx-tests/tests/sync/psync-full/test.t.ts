import { FakeNfd } from "@ndn/nfdmgmt/test-fixture/prefix-reg";
import { Name } from "@ndn/packet";
import { FullSync, makePSyncCompatParam, PSyncZlib, type SyncUpdate } from "@ndn/psync";
import { Closers, delay } from "@ndn/util";
import { afterEach, expect, test, vi } from "vitest";

import * as cxx from "../../../test-fixture/cxxprogram";

const syncPrefix = new Name("/sync");
const userA = new Name("/userA");
const userB = new Name("/userB");
const userC = new Name("/userC");

const closers = new Closers();
afterEach(closers.close);

test.each([0, 1])("sync compressed=%d", async (compressed) => {
  const exe = await cxx.compile(import.meta.dirname);

  await using nfd = await new FakeNfd().open();

  const p = exe.run([`${nfd.port}`, `${syncPrefix}`, `${userA}`, `${compressed}`], {});
  await nfd.waitNFaces(1);

  const sync = new FullSync({
    p: makePSyncCompatParam({
      expectedEntries: 30,
      ibltCompression: compressed ? PSyncZlib : undefined,
      contentCompression: compressed ? PSyncZlib : undefined,
    }),
    syncPrefix,
    cpOpts: { fw: nfd.fw },
    syncInterestLifetime: 100,
    syncReplyFreshness: 500,
  });
  closers.push(sync);

  const handleUpdate = vi.fn<(update: SyncUpdate<Name>) => void>();
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
  for (const line of stdout) {
    const [user, , hiSeqNum] = line.split("\t") as [string, string, string];
    hiSeqNums.set(user, Number.parseInt(hiSeqNum, 10));
  }
  expect(hiSeqNums.get(`${userB}`)).toBe(6);
  expect(hiSeqNums.get(`${userC}`)).toBe(1);
});
