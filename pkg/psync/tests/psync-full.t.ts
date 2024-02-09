import "@ndn/packet/test-fixture/expect";

import { Endpoint } from "@ndn/endpoint";
import { Forwarder } from "@ndn/fw";
import { Bridge } from "@ndn/l3face";
import { Name, type NameLike } from "@ndn/packet";
import { assert, Closers, delay, toHex } from "@ndn/util";
import DefaultMap from "mnemonist/default-map.js";
import { afterEach, beforeEach, describe, expect, type Mock, test, vi } from "vitest";

import { FullSync, type IBLT, makePSyncCompatParam, type SyncNode, type SyncUpdate } from "..";

class DebugPrinter {
  public static enabled = process.env.NDNTS_SYNC_DEBUG === "1";

  private readonly t0 = Date.now();
  private ibltIndex = 0;
  private readonly ibltMap = new DefaultMap<string, number>(() => ++this.ibltIndex);

  private reprIblt(iblt?: IBLT): string {
    return iblt ? `${this.ibltMap.get(toHex(iblt.serialize()))}` : "_";
  }

  private reprState(state?: Array<{ prefix: Name; seqNum: number }>): string {
    if (!state) {
      return "";
    }
    return `${state.map(({ prefix, seqNum }) => `${prefix}:${seqNum}`).join(",")}`;
  }

  public start(title: string, sync: FullSync): void {
    if (!DebugPrinter.enabled) {
      return;
    }
    sync.addEventListener("debug", ({ detail: { action, ownIblt, recvIblt, state } }) => {
      process.stderr.write(`${Date.now() - this.t0} ${title} ${action} ${
        this.reprIblt(ownIblt)} ${this.reprIblt(recvIblt)} ${this.reprState(state)}\n`);
    });
  }

  public log(title: string, line: string): void {
    if (!DebugPrinter.enabled) {
      return;
    }
    process.stderr.write(`${Date.now() - this.t0} ${title} ${line}\n`);
  }
}

const paramCompat = makePSyncCompatParam({ expectedEntries: 40 });
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

    const star = Bridge.star({
      leaves: n - 1,
      relayAB: { loss, delay: 3, jitter: 0.6 },
      relayBA: { delay: 3, jitter: 0.6 },
    }, Forwarder.getDefault());
    closers.push(...star);

    for (const bridge of [undefined, ...star]) {
      this.syncs.push(new FullSync({
        endpoint: bridge && new Endpoint({ fw: bridge.fwB }),
        p: paramCompat,
        syncPrefix: new Name("/psync-test"),
        syncInterestLifetime: 100,
        syncInterestInterval: [110, 150],
      }));
    }
    closers.push(...this.syncs);

    for (const [i, sync] of this.syncs.entries()) {
      const title = String.fromCodePoint(0x41 + i);
      debugPrinter.start(title, sync);

      const handleUpdate = vi.fn<[SyncUpdate<Name>], void>()
        .mockImplementation(({ id, loSeqNum, hiSeqNum }) => { // eslint-disable-line @typescript-eslint/no-loop-func
          debugPrinter.log(title, `UPDATE ${id} ${loSeqNum} ${hiSeqNum}`);
        });
      sync.addEventListener("update", handleUpdate);
      this.updates.push(handleUpdate);
    }
  }

  private readonly syncs: FullSync[] = [];
  private readonly updates: Array<Mock<[SyncUpdate<Name>], void>> = [];

  public delayTick(multiple = 1): Promise<void> {
    return delay(250 * multiple);
  }

  public add(i: number, prefix: NameLike): SyncNode<Name> {
    return this.syncs[i]!.add(Name.from(prefix));
  }

  public get(i: number, prefix: NameLike): SyncNode<Name> | undefined {
    return this.syncs[i]!.get(Name.from(prefix));
  }

  public expectUpdateTimes(i: number, count: number): void {
    expect(this.updates[i]).toHaveBeenCalledTimes(count);
  }

  public expectLastUpdate(i: number, prefix?: NameLike, seqNums?: readonly number[]): SyncUpdate<Name> {
    return this.expectNthUpdate(i, -1, prefix, seqNums);
  }

  public expectNthUpdate(i: number, n: number, prefix?: NameLike, seqNums?: readonly number[]): SyncUpdate<Name> {
    const fn = this.updates[i]!;
    if (n < 0) {
      n += fn.mock.calls.length;
    }

    const update = fn.mock.calls[n]![0];
    this.expectUpdateIs(update, prefix, seqNums);
    return update;
  }

  public expectUpdateIs(update: SyncUpdate<Name>, prefix?: NameLike, seqNums?: readonly number[]): void {
    if (prefix) {
      expect(update.id).toEqualName(prefix);
    }
    if (seqNums) {
      expect(Array.from(update.seqNums())).toEqual(seqNums);
      expect(update.count).toBe(seqNums.length);
      expect(update.loSeqNum).toBe(seqNums[0]);
      expect(update.hiSeqNum).toBe(seqNums.at(-1));
    }
  }
}

test("simple", async () => {
  const f = new Fixture(2);
  await f.delayTick();

  const nodeA0 = f.add(0, new Name("/A-0"));
  const nodeA1 = f.add(0, new Name("/A-1"));
  const nodeB0 = f.add(1, new Name("/B-0"));

  nodeA0.seqNum = 0; // no change
  await f.delayTick();
  f.expectUpdateTimes(0, 0);
  f.expectUpdateTimes(1, 0);

  nodeA0.seqNum++;
  await f.delayTick();
  f.expectUpdateTimes(0, 0);
  f.expectUpdateTimes(1, 1);
  f.expectLastUpdate(1, "/A-0", [1]);

  nodeA0.seqNum = 1; // no change
  await f.delayTick();
  f.expectUpdateTimes(0, 0);
  f.expectUpdateTimes(1, 1);

  nodeA0.seqNum++;
  await f.delayTick();
  f.expectUpdateTimes(0, 0);
  f.expectUpdateTimes(1, 2);
  f.expectLastUpdate(1, "/A-0", [2]);

  nodeA0.seqNum = 5; // increase by more than 1
  await f.delayTick();
  f.expectUpdateTimes(0, 0);
  f.expectUpdateTimes(1, 3);
  f.expectLastUpdate(1, "/A-0", [3, 4, 5]);

  nodeA1.seqNum++; // simultaneous publish on multiple instances
  nodeB0.seqNum++;
  await f.delayTick();
  f.expectUpdateTimes(0, 1);
  f.expectLastUpdate(0, "/B-0", [1]);
  f.expectUpdateTimes(1, 4);
  f.expectLastUpdate(1, "/A-1", [1]);

  nodeA0.seqNum++; // simultaneous publish on multiple nodes
  nodeA1.seqNum++;
  await f.delayTick();
  f.expectUpdateTimes(0, 1);
  f.expectUpdateTimes(1, 6);
  {
    let update0 = f.expectNthUpdate(1, -1);
    let update1 = f.expectNthUpdate(1, -2);
    if (update1.id.equals("/A-0")) {
      [update1, update0] = [update0, update1];
    }
    f.expectUpdateIs(update0, "/A-0", [6]);
    f.expectUpdateIs(update1, "/A-1", [2]);
  }
});

test.each([20, 50, 100])("many updates %d", async (count) => {
  const f = new Fixture(2);
  await f.delayTick();

  for (let i = 0; i < count; ++i) {
    f.add(0, `/A-${i}`).seqNum++;
  }

  await f.delayTick(4);
  f.expectUpdateTimes(1, count);
  for (let i = 0; i < count; ++i) {
    const node = f.get(1, `/A-${i}`);
    expect(node).toBeDefined();
    expect(node!.seqNum).toBe(1);
  }
});

describe.each([4, 6])("many nodes %d", (count) => {
  test("", async () => {
    const f = new Fixture(count);
    await f.delayTick();

    for (let i = 0; i < count; ++i) {
      f.add(i, `/${i}`).seqNum++;
    }

    await f.delayTick(count ** 2);
    for (let i = 0; i < count; ++i) {
      f.expectUpdateTimes(i, count - 1);
      for (let j = 0; j < count; ++j) {
        const node = f.get(i, `/${j}`);
        expect(node).toBeDefined();
        expect(node!.seqNum).toBe(1);
      }
    }
  }, 20000);
});
