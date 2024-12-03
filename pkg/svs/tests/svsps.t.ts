import "@ndn/packet/test-fixture/expect";

import { Forwarder } from "@ndn/fw";
import { generateSigningKey } from "@ndn/keychain";
import { Name, type NameLike } from "@ndn/packet";
import { DataArray } from "@ndn/repo-api";
import { Closers, console, crypto, delay } from "@ndn/util";
import { afterEach, beforeAll, expect, test, vi } from "vitest";

import { type MappingEntry, type Subscription, SvPublisher, SvSubscriber, SvSync, TimedMappingEntry } from "..";

let syncOpts: SvSync.Options;
let pubOpts: Partial<SvPublisher.Options>;
let subOpts: Partial<SvSubscriber.Options>;

beforeAll(async () => {
  const [signerS, verifierS] = await generateSigningKey("/kS");
  const [signerI, verifierI] = await generateSigningKey("/kI");
  const [signerO, verifierO] = await generateSigningKey("/kO");
  const [signerM, verifierM] = await generateSigningKey("/kM");
  syncOpts = {
    syncPrefix: new Name("/svs-test"),
    syncInterestLifetime: 200,
    steadyTimer: [400, 0.05],
    suppressionTimer: [50, 0.4],
    signer: signerS,
    verifier: verifierS,
  };
  pubOpts = {
    innerSigner: signerI,
    outerSigner: signerO,
    mappingSigner: signerM,
  };
  subOpts = {
    innerVerifier: verifierI,
    outerVerifier: verifierO,
    mappingVerifier: verifierM,
  };
});
const closers = new Closers();
afterEach(() => {
  closers.close();
  Forwarder.deleteDefault();
});

function enableDebug(subs: Record<string, SvSubscriber<any>>): void {
  if (process.env.NDNTS_SYNC_DEBUG !== "1") {
    return;
  }
  for (const [id, sub] of Object.entries(subs)) {
    sub.addEventListener("error", ({ detail }) => console.error(id, detail));
  }
}

type Sub = Subscription<Name, SvSubscriber.Update>;

async function publishCheck(
    publisher: SvPublisher,
    name: NameLike,
    payloadLength: number,
    entry: MappingEntry | undefined,
    expectReceive: readonly Sub[],
    expectNotReceive: readonly Sub[],
) {
  const abort = new AbortController();
  const received = Array.from<SvSubscriber.Update | undefined>({ length: expectReceive.length });
  let nWaiting = expectReceive.length;
  const allReceived = Promise.withResolvers<void>();
  for (const [i, sub] of expectReceive.entries()) {
    sub.addEventListener("update", (update) => { // eslint-disable-line @typescript-eslint/no-loop-func
      expect(received[i]).toBeUndefined();
      received[i] = update;
      if (--nWaiting === 0) {
        setTimeout(() => allReceived.resolve(), 200);
      }
    }, { signal: abort.signal });
  }
  for (const sub of expectNotReceive) {
    sub.addEventListener("update", ({ publisher, seqNum, name }) => {
      expect.fail(`unexpected update ${publisher}:${seqNum} ${name}`);
    }, { signal: abort.signal });
  }

  const payload = crypto.getRandomValues(new Uint8Array(payloadLength));
  const seqNum = await publisher.publish(name, payload, entry);
  await Promise.race([
    delay(1000),
    allReceived.promise,
  ]);

  for (const update of received) {
    expect(update).toBeDefined();
    expect(update!.publisher).toEqualName(publisher.id);
    expect(update!.seqNum).toBe(seqNum);
    expect(update!.name).toEqualName(name);
    expect(update!.payload).toEqualUint8Array(payload);
  }
  abort.abort();
}

test("simple", { timeout: 20000 }, async () => {
  const [signerE] = await generateSigningKey("/kE");

  const syncA = await SvSync.create({ ...syncOpts, describe: "A" });
  const syncB = await SvSync.create({ ...syncOpts, describe: "B" });
  const syncC = await SvSync.create({ ...syncOpts, describe: "C" });
  const syncD = await SvSync.create({ ...syncOpts, describe: "D" });
  closers.push(syncA, syncB, syncC, syncD);

  const repoA = new DataArray();
  const repoB = new DataArray();

  const pubA0 = new SvPublisher({ ...pubOpts, sync: syncA, id: new Name("/0"), store: repoA });
  const pubA1 = new SvPublisher({ ...pubOpts, sync: syncA, id: new Name("/1"), store: repoA });
  const pubB2 = new SvPublisher({ ...pubOpts, sync: syncB, id: new Name("/2"), store: repoB });
  const pubB7 = new SvPublisher({ ...pubOpts, sync: syncB, id: new Name("/7"), store: repoB, innerSigner: signerE });
  const pubB8 = new SvPublisher({ ...pubOpts, sync: syncB, id: new Name("/8"), store: repoB, outerSigner: signerE });
  const pubB9 = new SvPublisher({ ...pubOpts, sync: syncB, id: new Name("/9"), store: repoB, mappingSigner: signerE });
  closers.push(pubA0, pubA1, pubB2, pubB8, pubB8, pubB9);

  const subC = new SvSubscriber({ ...subOpts, sync: syncC });
  const subD = new SvSubscriber({ ...subOpts, sync: syncD });
  closers.push(subC, subD);
  enableDebug({ subC, subD });

  const subC1 = subC.subscribe({ publisher: new Name("/1") });
  const subC9 = subC.subscribe({ publisher: new Name("/9") });
  const subDt = subD.subscribe(new Name("/t"));
  const subD0 = subD.subscribe({ publisher: new Name("/0") });

  await publishCheck(pubA0, "/s/0", 3333, undefined, [subD0], [subC1, subC9, subDt]);
  await publishCheck(pubA0, "/t/0", 6666, undefined, [subDt, subD0], [subC1, subC9]);
  await publishCheck(pubA1, "/s/1", 9999, undefined, [subC1], [subC9, subDt, subD0]);
  await publishCheck(pubA1, "/t/1", 11111, undefined, [subC1, subDt], [subC9, subD0]);
  syncB.get(pubB2.id).seqNum += 15; // force non-single mapping query
  await publishCheck(pubB2, "/s/2", 22222, undefined, [], [subC1, subC9, subDt, subD0]);
  await publishCheck(pubB2, "/t/2", 44444, undefined, [subDt], [subC1, subC9, subD0]);

  // bad inner signature
  await publishCheck(pubB7, "/t/7", 100, undefined, [], [subC1, subC9, subDt, subD0]);
  // bad outer signature
  await publishCheck(pubB8, "/t/8", 100, undefined, [], [subC1, subC9, subDt, subD0]);
  // bad mapping signature, but subC would not retrieve mapping
  await publishCheck(pubB9, "/t/9", 100, undefined, [subC9], [subC1, subDt, subD0]);
});

test("timed", { timeout: 20000 }, async () => {
  const syncA = await SvSync.create({ ...syncOpts, describe: "A" });
  const syncB = await SvSync.create({ ...syncOpts, describe: "B" });
  closers.push(syncA, syncB);

  const repoA = new DataArray();

  const pubP = new SvPublisher({ ...pubOpts, sync: syncA, id: new Name("/P"), store: repoA });
  const pubQ = new SvPublisher({ ...pubOpts, sync: syncA, id: new Name("/Q"), store: repoA });
  closers.push(pubP, pubQ);

  const sub0 = new SvSubscriber<TimedMappingEntry>({
    ...subOpts,
    sync: syncB,
    mappingEntryType: TimedMappingEntry,
  });
  const sub1 = new SvSubscriber<TimedMappingEntry>({
    ...subOpts,
    sync: syncB,
    mappingEntryType: TimedMappingEntry,
    mustFilterByMapping: true,
  });
  closers.push(sub0, sub1);
  enableDebug({ sub0, sub1 });

  const timeBound = Date.now() - 300000;
  const filterFunc = (entry: TimedMappingEntry) => entry.timestamp ? entry.timestamp.getTime() > timeBound : false;
  const makeOldEntry = () => {
    const entry = new TimedMappingEntry();
    entry.timestamp = new Date(timeBound - 3600000 * Math.random());
    return entry;
  };
  const makeNewEntry = () => new TimedMappingEntry();

  const sub0P = sub0.subscribe({ publisher: new Name("/P") });
  const sub0N = sub0.subscribe(new Name("/N"));
  const filter0F = vi.fn(filterFunc);
  const sub0F = sub0.subscribe({ prefix: new Name("/N"), filter: filter0F });
  const sub1P = sub1.subscribe({ publisher: new Name("/P") });
  const sub1N = sub1.subscribe(new Name("/N"));
  const filter1F = vi.fn(filterFunc);
  const sub1F = sub1.subscribe({ prefix: new Name("/N"), filter: filter1F });

  await publishCheck(pubP, "/H/0", 1000, makeOldEntry(), [sub0P, sub1P], [sub0N, sub0F, sub1N, sub1F]);
  await publishCheck(pubQ, "/H/1", 1000, makeOldEntry(), [], [sub0P, sub0N, sub0F, sub1P, sub1N, sub1F]);
  await publishCheck(pubP, "/H/2", 1000, makeNewEntry(), [sub0P, sub1P], [sub0N, sub0F, sub1N, sub1F]);
  await publishCheck(pubQ, "/H/3", 1000, makeNewEntry(), [], [sub0P, sub0N, sub0F, sub1P, sub1N, sub1F]);
  expect(filter0F).toHaveBeenCalledTimes(0);
  expect(filter1F).toHaveBeenCalledTimes(0);
  await publishCheck(pubP, "/N/0", 1000, makeOldEntry(), [sub0P, sub0N, sub0F, sub1P, sub1N], [sub1F]);
  expect(filter0F).toHaveBeenCalledTimes(0);
  expect(filter1F).toHaveBeenCalledTimes(1);
  await publishCheck(pubQ, "/N/1", 1000, makeOldEntry(), [sub0N, sub1N], [sub0P, sub0F, sub1P, sub1F]);
  expect(filter0F).toHaveBeenCalledTimes(1);
  expect(filter1F).toHaveBeenCalledTimes(2);
  await publishCheck(pubP, "/N/2", 1000, makeNewEntry(), [sub0P, sub0N, sub0F, sub1P, sub1N, sub1F], []);
  expect(filter0F).toHaveBeenCalledTimes(1);
  expect(filter1F).toHaveBeenCalledTimes(3);
  await publishCheck(pubQ, "/N/3", 1000, makeNewEntry(), [sub0N, sub0F, sub1N, sub1F], [sub0P, sub1P]);
  expect(filter0F).toHaveBeenCalledTimes(2);
  expect(filter1F).toHaveBeenCalledTimes(4);
});
