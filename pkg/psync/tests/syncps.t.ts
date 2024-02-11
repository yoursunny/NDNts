import "@ndn/packet/test-fixture/expect";

import { Endpoint } from "@ndn/endpoint";
import { Forwarder } from "@ndn/fw";
import { Bridge } from "@ndn/l3face";
import { Timestamp } from "@ndn/naming-convention2";
import { Data, Name, type NameLike } from "@ndn/packet";
import { assert, Closers, delay } from "@ndn/util";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { makeSyncpsCompatParam, type Subscription, SyncpsPubsub } from "..";

class DebugPrinter {
  public static enabled = process.env.NDNTS_SYNC_DEBUG === "1";

  private readonly t0 = Date.now();

  public start(title: string, sync: SyncpsPubsub): void {
    if (!DebugPrinter.enabled) {
      return;
    }
    sync.addEventListener("debug", ({ detail: { action, name, content } }) => {
      process.stderr.write(`${Date.now() - this.t0} ${title} ${action} ${name ?? ""
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
      const bridge = Bridge.create({
        fwA: Forwarder.getDefault(),
        relayAB: { loss, delay: 3, jitter: 0.6 },
        relayBA: { delay: 3, jitter: 0.6 },
      });

      this.syncs.push(new SyncpsPubsub({
        ...opts,
        endpoint: new Endpoint({ fw: bridge.fwB }),
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

  public subscribe(i: number, topic: NameLike): [sub: Subscription<Name, CustomEvent<Data>>, updates: readonly Name[]] {
    const title = String.fromCodePoint(0x41 + i);
    topic = Name.from(topic);
    const updates: Name[] = [];
    const handleUpdate = vi.fn<[CustomEvent<Data>], void>()
      .mockImplementation(({ detail: pub }) => {
        updates.push(pub.name);
        debugPrinter.log(title, `UPDATE ${topic} ${pub.name}`);
      });

    const sub = this.syncs[i]!.subscribe(topic);
    sub.addEventListener("update", handleUpdate);
    return [sub, updates];
  }

  public delayTick(multiple = 1): Promise<void> {
    return delay(300 * multiple);
  }
}

function untimed(versioned: readonly Name[]): Name[] {
  return versioned.map((name) => {
    expect(name.at(-1).is(Timestamp)).toBeTruthy();
    return name.getPrefix(-1);
  });
}

test("simple", async () => {
  const f = new Fixture(3);
  await f.delayTick();

  const [, updatesAtR] = f.subscribe(0, "/");
  const [, updatesAtP] = f.subscribe(0, "/P");
  const [subAtP1, updatesAtP1] = f.subscribe(0, "/P");
  const [subAtPZ, updatesAtPZ] = f.subscribe(0, "/P/Z");
  const [, updatesBtP] = f.subscribe(1, "/P");
  const [, updatesCtQ] = f.subscribe(2, "/Q");

  subAtPZ[Symbol.dispose]();
  await f.publish(1, "/P/Z/0");
  await f.delayTick();
  expect(updatesAtR).toHaveLength(0);
  expect(untimed(updatesAtP)).toEqualNames(["/P/Z/0"]);
  expect(updatesAtP1).toEqualNames(updatesAtP);
  expect(updatesAtPZ).toHaveLength(0);
  expect(updatesBtP).toHaveLength(0);
  expect(updatesCtQ).toHaveLength(0);

  subAtP1[Symbol.dispose]();
  await Promise.all([
    f.publish(0, "/P/A/1"),
    f.publish(1, "/P/B/1"),
    f.publish(1, "/Q/B/1"),
    f.publish(2, "/P/C/1"),
  ]);
  await f.delayTick(2);
  expect(untimed(updatesAtR)).toEqualNames(["/Q/B/1"]);
  expect(untimed(updatesAtP)).toEqualNames(["/P/Z/0", "/P/B/1", "/P/C/1"]);
  expect(untimed(updatesAtP1)).toEqualNames(["/P/Z/0"]);
  expect(untimed(updatesBtP)).toEqualNames(["/P/A/1", "/P/C/1"]);
  expect(untimed(updatesCtQ)).toEqualNames(["/Q/B/1"]);
});
