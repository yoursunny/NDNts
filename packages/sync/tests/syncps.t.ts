import "@ndn/packet/test-fixture/expect";

import { Endpoint } from "@ndn/endpoint";
import { Forwarder } from "@ndn/fw";
import { Bridge } from "@ndn/l3face/test-fixture/bridge";
import { Closers } from "@ndn/l3face/test-fixture/closers";
import { type NameLike, Data, Name } from "@ndn/packet";
import assert from "minimalistic-assert";
import { setTimeout as delay } from "node:timers/promises";

import { type Subscription, makeSyncpsCompatParam, SyncpsPubsub } from "..";

class DebugPrinter {
  public static enabled = process.env.NDNTS_SYNC_DEBUG === "1";

  private readonly t0 = Date.now();

  public start(title: string, sync: SyncpsPubsub): void {
    if (!DebugPrinter.enabled) {
      return;
    }
    sync.on("debug", ({ action, name, content }) => {
      process.stderr.write(`${Date.now() - this.t0} ${title} ${action} ${name ? name : ""
      } ${content ? `[${content.map((name) => `${name}`).join(",")}]` : ""}\n`);
    });
  }

  public log(title: string, line: string): void {
    if (!DebugPrinter.enabled) {
      return;
    }
    process.stderr.write(`${Date.now() - this.t0} ${title} ${line}\n`);
  }
}

const paramCompat = makeSyncpsCompatParam();
let debugPrinter: DebugPrinter;
const closers = new Closers();

beforeEach(() => {
  debugPrinter = new DebugPrinter();
});
afterEach(() => {
  closers.close();
  Forwarder.deleteDefault();
});

type UpdateMock = jest.Mock<void, [Data]>;

class Fixture {
  constructor(n: number, loss = 0) {
    assert(n >= 2);

    const opts: SyncpsPubsub.Options = {
      p: paramCompat,
      syncPrefix: new Name("/syncps-test"),
      syncInterestLifetime: 100,
    };
    this.syncs.push(new SyncpsPubsub({ ...opts }));

    for (let i = 1; i < n; ++i) {
      const fw = Forwarder.create();
      const bridge = Bridge.create({
        fwA: Forwarder.getDefault(),
        fwB: fw,
        relayAB: {
          minDelay: 1,
          maxDelay: 5,
          loss,
        },
        relayBA: {
          minDelay: 1,
          maxDelay: 5,
        },
      });

      this.syncs.push(new SyncpsPubsub({
        ...opts,
        endpoint: new Endpoint({ fw }),
      }));
      closers.push(bridge);
    }
    closers.push(...this.syncs);

    for (const [i, sync] of this.syncs.entries()) {
      const title = String.fromCodePoint(0x41 + i);
      debugPrinter.start(title, sync);
    }
  }

  private readonly syncs: SyncpsPubsub[] = [];

  public async publish(i: number, pub: Data | NameLike, cb?: SyncpsPubsub.PublishCallback): Promise<void> {
    await this.syncs[i]!.publish(new Data(pub), cb);
  }

  public subscribe(i: number, topic: NameLike): [sub: Subscription, update: UpdateMock] {
    const title = String.fromCodePoint(0x41 + i);
    topic = new Name(topic);
    const update = jest.fn<void, [Data]>()
      .mockImplementation((pub) => debugPrinter.log(title, `UPDATE ${topic} ${pub.name}`));

    const sub = this.syncs[i]!.subscribe(topic);
    sub.on("update", update);
    return [sub, update];
  }

  public delayTick(multiple = 1): Promise<void> {
    return delay(300 * multiple);
  }
}

test("simple", async () => {
  const f = new Fixture(3);
  await f.delayTick();

  const [, updateAtR] = f.subscribe(0, "/");
  const [, updateAtP] = f.subscribe(0, "/P");
  const [subAtP1, updateAtP1] = f.subscribe(0, "/P");
  const [subAtPZ, updateAtPZ] = f.subscribe(0, "/P/Z");
  const [, updateBtP] = f.subscribe(1, "/P");
  const [, updateCtQ] = f.subscribe(2, "/Q");

  subAtPZ.remove();
  await f.publish(1, "/P/Z/0");
  await f.delayTick();
  expect(updateAtR).toHaveBeenCalledTimes(0);
  expect(updateAtP).toHaveBeenCalledTimes(1);
  expect(updateAtP.mock.calls[0]![0]!.name.getPrefix(-1)).toEqualName("/P/Z/0");
  expect(updateAtP1).toHaveBeenCalledTimes(1);
  expect(updateAtP1.mock.calls[0]![0]!).toHaveName(updateAtP.mock.calls[0]![0]!.name);
  expect(updateAtPZ).toHaveBeenCalledTimes(0);
  expect(updateBtP).toHaveBeenCalledTimes(0);
  expect(updateCtQ).toHaveBeenCalledTimes(0);

  subAtP1.remove();
  await Promise.all([
    f.publish(0, "/P/A/1"),
    f.publish(1, "/P/B/1"),
    f.publish(1, "/Q/B/1"),
    f.publish(2, "/P/C/1"),
  ]);
  await f.delayTick(2);
  expect(updateAtR).toHaveBeenCalledTimes(1); // /Q/B/1
  expect(updateAtP).toHaveBeenCalledTimes(3); // /P/Z/0, /P/A/1, /P/C/1
  expect(updateAtP1).toHaveBeenCalledTimes(1); // /P/Z/0
  expect(updateBtP).toHaveBeenCalledTimes(2); // /P/A/1, /P/C/1
  expect(updateCtQ).toHaveBeenCalledTimes(1); // /Q/B/1
});
