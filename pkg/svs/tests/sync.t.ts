import "@ndn/packet/test-fixture/expect";

import { Forwarder } from "@ndn/fw";
import { Certificate, generateSigningKey } from "@ndn/keychain";
import { Bridge } from "@ndn/l3face";
import { Data, Interest, Name } from "@ndn/packet";
import { Closers, delay } from "@ndn/util";
import DefaultMap from "mnemonist/default-map.js";
import { filter } from "streaming-iterables";
import { afterEach, expect, test, vi } from "vitest";

import { StateVector, SvSync } from "..";

class UpdateHandler {
  constructor(sync: SvSync) {
    sync.addEventListener("update", (update) => {
      const id = update.id.toString().slice(-1);
      expect(update.loSeqNum).toBe(this.lastSeqNum.get(id) + 1);
      expect(update.loSeqNum).toBeLessThanOrEqual(update.hiSeqNum);
      this.lastSeqNum.set(id, update.hiSeqNum);
    });
  }

  // key is last character of node ID
  public readonly lastSeqNum = new DefaultMap<string, number>(() => 0);

  public get lastSeqNumRecord(): Record<string, number> {
    return Object.fromEntries(this.lastSeqNum.entries());
  }
}

class DebugHandler {
  public static printing = process.env.NDNTS_SYNC_DEBUG === "1";
  private readonly t0 = performance.now();
  public readonly cnt = new DefaultMap<string, number>(() => 0);

  public start(sync: SvSync): void {
    sync.addEventListener("debug", ({ detail: { action, state, nextState, ourOlder, ourNewer } }) => {
      const cnt = `${sync.describe}:${action}`;
      this.cnt.set(cnt, this.cnt.get(cnt) + 1);
      if (DebugHandler.printing) {
        process.stderr.write(`${performance.now() - this.t0} ${sync.describe} ${action
        } ${JSON.stringify({ state, nextState, ourOlder, ourNewer })}\n`);
      }
    });
  }
}

const baseOpts: SvSync.Options = {
  syncPrefix: new Name("/svs-test"),
  syncInterestLifetime: 200,
  periodicTimeout: [600, 0.05],
  suppressionPeriod: 50,
};

const closers = new Closers();
afterEach(closers.close);

// specification section 5.2 "example with packet loss"
test.each([
  [2, false, Interest],
  [3, true, Data],
] as const)("5.2 svs%d", async (ver, svs3, typeSignVerify) => {
  void ver;
  const debugHandler = new DebugHandler();
  let lossToC = false;
  using bridge = Bridge.create({
    relayAB: (it) => filter(() => !lossToC, it),
  }).rename("AB", "C");

  const [pvt, pub] = await generateSigningKey("/G");
  const cert = await Certificate.selfSign({ privateKey: pvt, publicKey: pub });
  const signer = pvt.withKeyLocator(cert.name);
  const spySign = vi.spyOn(signer, "sign");
  const spyVerify = vi.spyOn(pub, "verify");
  const opts: SvSync.Options = { ...baseOpts, svs3, fw: bridge.fwAB, signer, verifier: pub };

  const pA = await SvSync.create({ ...opts, describe: "A" });
  const nA = pA.add("/A");
  nA.seqNum = 10;
  const uA = new UpdateHandler(pA);
  const pB = await SvSync.create({ ...opts, describe: "B" });
  const nB = pB.add("/B");
  nB.seqNum = 15;
  const uB = new UpdateHandler(pB);
  const pC = await SvSync.create({ ...opts, describe: "C", fw: bridge.fwC });
  const nC = pC.add(new Name("/C"));
  nC.seqNum = 25;
  const uC = new UpdateHandler(pC);
  closers.push(pA, pB, pC);

  await delay(800);
  expect(pA.get("/A").seqNum).toBe(10);
  expect(pB.get("/A").seqNum).toBe(10);
  expect(pC.get("/A").seqNum).toBe(10);
  expect(pA.get("/B").seqNum).toBe(15);
  expect(pB.get("/B").seqNum).toBe(15);
  expect(pC.get("/B").seqNum).toBe(15);
  expect(pA.get("/C").seqNum).toBe(25);
  expect(pB.get("/C").seqNum).toBe(25);
  expect(pC.get("/C").seqNum).toBe(25);

  debugHandler.start(pA);
  debugHandler.start(pB);
  debugHandler.start(pC);

  lossToC = true;
  ++nA.seqNum;
  expect(pA.get("/A").seqNum).toBe(11);
  expect(pB.get("/A").seqNum).toBe(10);
  expect(pC.get("/A").seqNum).toBe(10);

  await delay(100);
  expect(pA.get("/A").seqNum).toBe(11);
  expect(pB.get("/A").seqNum).toBe(11);
  expect(pC.get("/A").seqNum).toBe(10);
  expect(debugHandler.cnt.get("A:send")).toBe(1);
  expect(debugHandler.cnt.get("B:send")).toBe(0);
  expect(debugHandler.cnt.get("C:send")).toBe(0);
  debugHandler.cnt.clear();

  lossToC = false;
  await delay(800);
  expect(pA.get("/A").seqNum).toBe(11);
  expect(pB.get("/A").seqNum).toBe(11);
  expect(pC.get("/A").seqNum).toBe(11);

  expect(debugHandler.cnt.get("C:send")).toBe(1);
  expect(debugHandler.cnt.get("A:send") + debugHandler.cnt.get("B:send")).toBeLessThanOrEqual(2);

  expect(uA.lastSeqNumRecord).toEqual({ B: 15, C: 25 });
  expect(uB.lastSeqNumRecord).toEqual({ C: 25, A: 11 });
  expect(uC.lastSeqNumRecord).toEqual({ A: 11, B: 15 });

  expect(spySign).toHaveBeenCalled();
  expect(spySign.mock.lastCall![0]).toBeInstanceOf(typeSignVerify);
  expect(spyVerify).toHaveBeenCalled();
  expect(spyVerify.mock.lastCall![0]).toBeInstanceOf(typeSignVerify);
});

// specification section 5.3 "re-bootstrap"
test("5.3", async () => {
  const debugHandler = new DebugHandler();

  const initialStateVector = new StateVector();
  initialStateVector.set({ name: new Name("/A"), boot: 1636266330 }, 10);
  initialStateVector.set({ name: new Name("/B"), boot: 1636266412 }, 15);
  initialStateVector.set({ name: new Name("/C"), boot: 1636266115 }, 25);

  const opts: SvSync.Options = { ...baseOpts, svs3: true, initialStateVector };

  const pA0 = await SvSync.create({ ...opts, describe: "A0" });
  const pB0 = await SvSync.create({ ...opts, describe: "B0" });
  const nB0 = pB0.get("/B", 1636266412);
  const pC0 = await SvSync.create({ ...opts, describe: "C0" });
  closers.push(pA0, pB0, pC0);

  pA0.close();
  closers.splice(closers.indexOf(pA0), 1);

  ++nB0.seqNum;
  await delay(100);
  expect(pB0.get("/B", 1636266412).seqNum).toBe(16);
  expect(pC0.get("/B", 1636266412).seqNum).toBe(16);

  const pA1 = await SvSync.create({ ...opts, describe: "A1" });
  const nA1 = pA1.add("/A", SvSync.makeBootstrapTime(1736266473001));
  nA1.seqNum = 1;

  debugHandler.start(pA1);
  debugHandler.start(pB0);
  debugHandler.start(pC0);

  await delay(800);
  expect(pA1.get("/A", 1636266330).seqNum).toBe(10);
  expect(pB0.get("/A", 1636266330).seqNum).toBe(10);
  expect(pC0.get("/A", 1636266330).seqNum).toBe(10);
  expect(pA1.get("/A", 1736266473).seqNum).toBe(1);
  expect(pB0.get("/A", 1736266473).seqNum).toBe(1);
  expect(pC0.get("/A", 1736266473).seqNum).toBe(1);
  expect(pA1.get("/B", 1636266412).seqNum).toBe(16);
  expect(pB0.get("/B", 1636266412).seqNum).toBe(16);
  expect(pC0.get("/B", 1636266412).seqNum).toBe(16);
  expect(pA1.get({ name: "/C", boot: 1636266115 }).seqNum).toBe(25);
  expect(pB0.get("/C", 1636266115).seqNum).toBe(25);
  expect(pC0.get("/C", 1636266115).seqNum).toBe(25);
});

test("initialize", async () => {
  const debugHandler = new DebugHandler();
  const fw = Forwarder.create();
  const opts: SvSync.Options = { ...baseOpts, fw };

  const p0 = await SvSync.create({ ...opts, describe: "0" });
  closers.push(p0);
  debugHandler.start(p0);

  const n0A = p0.get("/A");
  n0A.seqNum = 11;
  n0A.remove(); // no effect
  const n0B = p0.get("/B");
  n0B.seqNum = 12;
  const n0C = p0.get("/C");
  n0C.seqNum = 13;
  n0C.seqNum = 3; // no effect
  await delay(200);
  expect(debugHandler.cnt.get("0:send")).toBe(1);

  p0.close();
  const v0 = p0.currentStateVector;
  expect(v0.get(new Name("/A"))).toBe(11);
  expect(v0.get(new Name("/B"))).toBe(12);
  expect(v0.get(new Name("/C"))).toBe(13);
  expect(v0.get(new Name("/D"))).toBe(0);

  // eslint-disable-next-line unicorn/prefer-structured-clone
  const v1 = new StateVector(JSON.parse(JSON.stringify(v0)));
  const p1 = await SvSync.create({
    ...opts,
    describe: "1",
    initialStateVector: v1,
    async initialize(sync) {
      closers.push(sync);
      debugHandler.start(sync);

      const n1A = sync.get("/A");
      const n1B = sync.get("/B");
      const n1C = sync.get("/C");
      const n1D = sync.get("/D");

      expect(n1A.seqNum).toBe(11);
      expect(n1B.seqNum).toBe(12);
      expect(n1C.seqNum).toBe(13);
      expect(n1D.seqNum).toBe(0);

      n1A.remove();
      n1B.seqNum = 22; // increase
      n1C.seqNum = 3; // decrease
      n1D.seqNum = 4; // new node

      await delay(800); // longer than steady timer, but no sync Interest would be sent
    },
  });
  expect(debugHandler.cnt.get("1:send")).toBe(0);

  expect(p1.get("/A").seqNum).toBe(0);
  expect(p1.get("/B").seqNum).toBe(22);
  expect(p1.get("/C").seqNum).toBe(3);
  const n1D = p1.get("/D");
  expect(n1D.seqNum).toBe(4);
  ++n1D.seqNum;
  await delay(200);
  expect(debugHandler.cnt.get("1:send")).toBe(1);
});

test("get add", async () => {
  const initialStateVector = new StateVector();
  initialStateVector.set({ name: new Name("/A"), boot: 1736890900 }, 1);
  initialStateVector.set({ name: new Name("/A"), boot: 1736890910 }, 1);
  initialStateVector.set({ name: new Name("/B"), boot: 1736890920 }, 1);

  const p = await SvSync.create({ ...baseOpts, svs3: true, initialStateVector });
  closers.push(p);

  // .get(id)
  const n0 = p.get({ name: "/A", boot: 1736890900 });
  expect(n0.id.name).toEqualName("/A");
  expect(n0.id.boot).toBe(1736890900);
  expect(n0.seqNum).toBe(1);

  // .get(name) - search for last bootstrap time of the name
  const n1 = p.get("/A");
  expect(n1.id.name).toEqualName("/A");
  expect(n1.id.boot).toBe(1736890910);
  expect(n1.seqNum).toBe(1);

  const minBootstrapTime = (Date.now() - 2000) / 1000;

  // .add(name) - do not search for last bootstrap time
  const n2 = p.add("/A");
  expect(n2.id.name).toEqualName("/A");
  expect(n2.id.boot).toBeGreaterThan(minBootstrapTime);
  expect(n2.seqNum).toBe(0);

  // .get(nonexistent-name)
  const n3 = p.get("/D");
  expect(n3.id.name).toEqualName("/D");
  expect(n3.id.boot).toBeGreaterThan(minBootstrapTime);
  expect(n3.seqNum).toBe(0);
});

test("future bootstrap time", async () => {
  const debugHandler = new DebugHandler();

  const opts: SvSync.Options = { ...baseOpts, svs3: true };

  const pA = await SvSync.create({ ...opts, describe: "A" });
  const pB = await SvSync.create({ ...opts, describe: "B" });

  debugHandler.start(pA);
  debugHandler.start(pB);

  const nB = pB.add("/B", SvSync.makeBootstrapTime() + 86499);
  ++nB.seqNum;

  await delay(100);
  expect(debugHandler.cnt.peek("A:rx-future")).toBeGreaterThanOrEqual(1);
});
