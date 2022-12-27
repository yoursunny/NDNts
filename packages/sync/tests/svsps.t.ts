import "@ndn/packet/test-fixture/expect";

import { setMaxListeners } from "node:events";

import { Endpoint } from "@ndn/endpoint";
import { generateSigningKey } from "@ndn/keychain";
import { type NameLike, Name } from "@ndn/packet";
import { DataStore } from "@ndn/repo";
import { Closers, console, crypto, delay } from "@ndn/util";
import memdown from "memdown";
import { afterEach, beforeAll, expect, test } from "vitest";

import type { Subscription } from "..";
import { SvPublisher, SvSubscriber, SvSync } from "..";

beforeAll(() => {
  setMaxListeners(20);
});
const closers = new Closers();
afterEach(() => {
  closers.close();
  Endpoint.deleteDefaultForwarder();
});

type Sub = Subscription<Name, SvSubscriber.Update>;
type UpdateHandler = (update: SvSubscriber.Update) => void;

async function publishCheck(
    publisher: SvPublisher,
    name: NameLike,
    payloadLength: number,
    expectReceive: readonly Sub[],
    expectNotReceive: readonly Sub[],
) {
  const updateEventHandlers: Array<[sub: Sub, handler: UpdateHandler]> = [];
  const received = Array.from<SvSubscriber.Update | undefined>({ length: expectReceive.length });
  for (const [i, sub] of expectReceive.entries()) {
    let isReceived = false;
    const h: UpdateHandler = (update) => {
      expect(isReceived).toBeFalsy();
      isReceived = true;
      received[i] = update;
    };
    sub.on("update", h);
    updateEventHandlers.push([sub, h]);
  }
  for (const sub of expectNotReceive) {
    const h: UpdateHandler = ({ publisher, seqNum, name }) => {
      expect.fail(`unexpected update ${publisher}:${seqNum} ${name}`);
    };
    sub.on("update", h);
    updateEventHandlers.push([sub, h]);
  }

  const payload = crypto.getRandomValues(new Uint8Array(payloadLength));
  const seqNum = await publisher.publish(name, payload);
  await delay(1000);

  for (const update of received) {
    expect(update).toBeTruthy();
    expect(update!.publisher).toEqualName(publisher.id);
    expect(update!.seqNum).toBe(seqNum);
    expect(update!.name).toEqualName(name);
    expect(update!.payload).toEqualUint8Array(payload);
  }
  for (const [sub, handler] of updateEventHandlers) {
    sub.off("update", handler);
  }
}

test("simple", async () => {
  const [signerS, verifierS] = await generateSigningKey("/kS");
  const [signerI, verifierI] = await generateSigningKey("/kI");
  const [signerO, verifierO] = await generateSigningKey("/kO");
  const [signerM, verifierM] = await generateSigningKey("/kM");
  const [signerE] = await generateSigningKey("/kE");

  const syncOpts: SvSync.Options = {
    syncPrefix: new Name("/svs-test"),
    syncInterestLifetime: 200,
    steadyTimer: [400, 0.05],
    suppressionTimer: [50, 0.4],
    signer: signerS,
    verifier: verifierS,
  };
  const syncA = new SvSync({ ...syncOpts, describe: "A" });
  const syncB = new SvSync({ ...syncOpts, describe: "B" });
  const syncC = new SvSync({ ...syncOpts, describe: "C" });
  const syncD = new SvSync({ ...syncOpts, describe: "D" });
  closers.push(syncA, syncB, syncC, syncD);

  const repoA = new DataStore(memdown());
  const repoB = new DataStore(memdown());
  const repoC = new DataStore(memdown());
  closers.push(repoA, repoB, repoC);

  const pubOpts: Partial<SvPublisher.Options> = {
    innerSigner: signerI,
    outerSigner: signerO,
    mappingSigner: signerM,
  };
  const pubA0 = new SvPublisher({ ...pubOpts, sync: syncA, id: new Name("/0"), store: repoA });
  const pubA1 = new SvPublisher({ ...pubOpts, sync: syncA, id: new Name("/1"), store: repoA });
  const pubB2 = new SvPublisher({ ...pubOpts, sync: syncB, id: new Name("/2"), store: repoB });
  const pubB7 = new SvPublisher({ ...pubOpts, sync: syncB, id: new Name("/7"), store: repoB, innerSigner: signerE });
  const pubB8 = new SvPublisher({ ...pubOpts, sync: syncB, id: new Name("/8"), store: repoB, outerSigner: signerE });
  const pubB9 = new SvPublisher({ ...pubOpts, sync: syncB, id: new Name("/9"), store: repoB, mappingSigner: signerE });
  closers.push(pubA0, pubA1, pubB2, pubB8, pubB8, pubB9);

  const subOpts: Partial<SvSubscriber.Options> = {
    innerVerifier: verifierI,
    outerVerifier: verifierO,
    mappingVerifier: verifierM,
  };
  const subC = new SvSubscriber({ ...subOpts, sync: syncC });
  const subD = new SvSubscriber({ ...subOpts, sync: syncD });
  closers.push(subC, subD);
  if (process.env.NDNTS_SYNC_DEBUG === "1") {
    subC.on("error", (err) => console.error("subC", err));
    subD.on("error", (err) => console.error("subD", err));
  }

  const subC1 = subC.subscribe({ publisher: new Name("/1") });
  const subC9 = subC.subscribe({ publisher: new Name("/9") });
  const subDt = subD.subscribe(new Name("/t"));
  const subD0 = subD.subscribe({ publisher: new Name("/0") });

  await publishCheck(pubA0, "/s/0", 3333, [subD0], [subC1, subC9, subDt]);
  await publishCheck(pubA0, "/t/0", 6666, [subDt, subD0], [subC1, subC9]);
  await publishCheck(pubA1, "/s/1", 9999, [subC1], [subC9, subDt, subD0]);
  await publishCheck(pubA1, "/t/1", 11111, [subC1, subDt], [subC9, subD0]);
  syncB.get(pubB2.id).seqNum += 15; // force non-single mapping query
  await publishCheck(pubB2, "/s/2", 22222, [], [subC1, subC9, subDt, subD0]);
  await publishCheck(pubB2, "/t/2", 44444, [subDt], [subC1, subC9, subD0]);

  // bad inner signature
  await publishCheck(pubB7, "/t/7", 100, [], [subC1, subC9, subDt, subD0]);
  // bad outer signaturet
  await publishCheck(pubB8, "/t/8", 100, [], [subC1, subC9, subDt, subD0]);
  // bad mapping signature, but subC would not retrieve mapping
  await publishCheck(pubB9, "/t/9", 100, [subC9], [subC1, subDt, subD0]);
}, { timeout: 20000 });
