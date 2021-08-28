import { Endpoint } from "@ndn/endpoint";
import { Forwarder } from "@ndn/fw";
import { Bridge } from "@ndn/l3face/test-fixture/bridge";
import { Closers } from "@ndn/l3face/test-fixture/closers";
import { Name } from "@ndn/packet";
import DefaultMap from "mnemonist/default-map.js";
import { filter } from "streaming-iterables";

import { SvSync } from "..";

class DebugHandler {
  public static printing = process.env.NDNTS_SYNC_DEBUG === "1";
  private readonly t0 = Date.now();
  public readonly cnt = new DefaultMap<string, number>(() => 0);

  public start(sync: SvSync): void {
    const id = sync.describe;
    sync.on("debug", ({ action, state, nextState, ourOlder, ourNewer }) => {
      const cnt = `${id}:${action}`;
      this.cnt.set(cnt, this.cnt.get(cnt) + 1);
      if (DebugHandler.printing) {
        process.stderr.write(`${Date.now() - this.t0} ${id} ${action
        } ${JSON.stringify({ state, nextState, ourOlder, ourNewer })}\n`);
      }
    });
  }
}

const closers = new Closers();
afterEach(closers.close);

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// specification section 5.2 example
test("example", async () => {
  const debugHandler = new DebugHandler();
  const fwAB = Forwarder.create();
  const fwC = Forwarder.create();
  let lossToC = false;
  const bridge = Bridge.create({
    fwA: fwAB,
    fwB: fwC,
    relayAB: (it) => filter(() => !lossToC, it),
  });
  bridge.faceA.addRoute(new Name());
  bridge.faceB.addRoute(new Name());
  closers.push(bridge);

  const opts: SvSync.Options = {
    endpoint: new Endpoint({ fw: fwAB }),
    syncPrefix: new Name("/svs-test"),
    syncInterestLifetime: 200,
    steadyTimer: [900, 0.05],
    suppressionTimer: [50, 0.4],
  };

  const pA = new SvSync({ ...opts, describe: "A" });
  const nA = pA.add("A");
  nA.seqNum = 10;
  const pB = new SvSync({ ...opts, describe: "B" });
  const nB = pB.add("B");
  nB.seqNum = 15;
  const pC = new SvSync({ ...opts, describe: "C", endpoint: new Endpoint({ fw: fwC }) });
  const nC = pC.add("C");
  nC.seqNum = 25;
  closers.push(pA, pB, pC);

  await delay(200);
  expect(pA.get("A").seqNum).toBe(10);
  expect(pB.get("A").seqNum).toBe(10);
  expect(pC.get("A").seqNum).toBe(10);
  expect(pA.get("B").seqNum).toBe(15);
  expect(pB.get("B").seqNum).toBe(15);
  expect(pC.get("B").seqNum).toBe(15);
  expect(pA.get("C").seqNum).toBe(25);
  expect(pB.get("C").seqNum).toBe(25);
  expect(pC.get("C").seqNum).toBe(25);

  debugHandler.start(pA);
  debugHandler.start(pB);
  debugHandler.start(pC);

  lossToC = true;
  ++nA.seqNum;
  expect(pA.get("A").seqNum).toBe(11);
  expect(pB.get("A").seqNum).toBe(10);
  expect(pC.get("A").seqNum).toBe(10);

  await delay(100);
  expect(pA.get("A").seqNum).toBe(11);
  expect(pB.get("A").seqNum).toBe(11);
  expect(pC.get("A").seqNum).toBe(10);
  expect(debugHandler.cnt.get("A:send")).toBe(1);
  expect(debugHandler.cnt.get("B:send")).toBe(0);
  expect(debugHandler.cnt.get("C:send")).toBe(0);
  debugHandler.cnt.clear();

  lossToC = false;
  await delay(1000);
  expect(pA.get("A").seqNum).toBe(11);
  expect(pB.get("A").seqNum).toBe(11);
  expect(pC.get("A").seqNum).toBe(11);

  expect(debugHandler.cnt.get("C:send")).toBe(1);
  expect(debugHandler.cnt.get("A:send") + debugHandler.cnt.get("B:send")).toBeLessThanOrEqual(2);
});
