import "@ndn/packet/test-fixture/expect";

import { Endpoint } from "@ndn/endpoint";
import { Name } from "@ndn/packet";
import { delay } from "@ndn/util";
import { afterEach, expect, type Mock, test, vi } from "vitest";

import { makePSyncCompatParam, PartialPublisher, PartialSubscriber, type Subscription, type SyncUpdate } from "..";

afterEach(Endpoint.deleteDefaultForwarder);

function delayTick(multiple = 1): Promise<void> {
  return delay(300 * multiple);
}

test("simple", async () => {
  const pub = new PartialPublisher({
    p: makePSyncCompatParam(),
    syncPrefix: new Name("/psync-test"),
  });
  const pt = [
    pub.add(new Name("/P/0")),
    pub.add(new Name("/P/1")),
    pub.add(new Name("/P/2")),
    pub.add(new Name("/P/3")),
  ];
  await delayTick();

  const sub = new PartialSubscriber({
    p: makePSyncCompatParam(),
    syncPrefix: new Name("/psync-test"),
    syncInterestLifetime: 100,
    syncInterestInterval: [110, 150],
  });
  const st: Array<[Subscription, Mock<[SyncUpdate<Name>], void>]> = [];
  const subState = vi.fn(({ topics }: PartialSubscriber.StateEvent) => {
    expect(topics).toHaveLength(4);
    for (const [i, { id }] of pt.entries()) {
      const found = topics.filter(({ prefix }) => prefix.equals(id));
      expect(found).toHaveLength(1);
      if (i % 2 === 0) {
        const subscription = sub.subscribe(found[0]!);
        const handleUpdate = vi.fn<[SyncUpdate<Name>], void>();
        subscription.addEventListener("update", handleUpdate);
        st.push([subscription, handleUpdate]);
      }
    }
  });
  sub.addEventListener("state", subState);
  await delayTick();
  expect(subState).toHaveBeenCalledTimes(1);
  expect(st).toHaveLength(2);

  pt[0]!.seqNum = 1;
  pt[1]!.seqNum = 4;
  pt[3]!.seqNum = 2;
  await delayTick();
  expect(st[0]![1]).toHaveBeenCalledTimes(1);
  expect(st[1]![1]).toHaveBeenCalledTimes(0);

  pt[0]!.seqNum = 2;
  pt[2]!.seqNum = 2;
  await delayTick();
  expect(st[0]![1]).toHaveBeenCalledTimes(2);
  expect(st[1]![1]).toHaveBeenCalledTimes(1);

  pt[3]!.seqNum = 6;
  await delayTick();
  expect(st[0]![1]).toHaveBeenCalledTimes(2);
  expect(st[1]![1]).toHaveBeenCalledTimes(1);

  st[0]![0][Symbol.dispose]();
  pt[0]!.seqNum = 6;
  pt[1]!.seqNum = 6;
  pt[2]!.seqNum = 6;
  await delayTick();
  expect(st[0]![1]).toHaveBeenCalledTimes(2);
  expect(st[1]![1]).toHaveBeenCalledTimes(2);

  pub.close();
  sub.close();
}, { retry: 3 });
