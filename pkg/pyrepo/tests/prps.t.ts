import { Forwarder } from "@ndn/fw";
import { Bridge } from "@ndn/l3face";
import { Name } from "@ndn/packet";
import { Closers, delay } from "@ndn/util";
import { afterEach, expect, test } from "vitest";

import { PrpsPublisher, PrpsSubscriber } from "..";

afterEach(Forwarder.deleteDefault);

test("pubsub", { timeout: 10000 }, async () => {
  const star = Bridge.star({
    leaves: 3,
    relayBA: { delay: 6, jitter: 0.1 },
  });

  const sub0 = new PrpsSubscriber({
    cpOpts: { fw: star[0]!.fwB },
    msgInterestLifetime: 200,
  });
  const sub1 = new PrpsSubscriber({
    cpOpts: { fw: star[1]!.fwB },
    msgInterestLifetime: 200,
  });
  using pub = new PrpsPublisher({
    cpOpts: { fw: star[2]!.fwB, retx: 1 },
    notifyInterestLifetime: 1000,
  });

  const topicA = new Name("/prps-demo/A");
  const topicB = new Name("/prps-demo/B");
  const topicC = new Name("/prps-demo/C");
  const pubTopicMap: Record<number, Name> = { 0: topicA, 1: topicA, 2: topicB, 3: topicB, 4: topicC };
  const pubPromises: Array<Promise<void>> = [];
  const pubExpectedResults: Array<PromiseSettledResult<void>["status"]> = [];
  for (let i = 0; i < 100; ++i) {
    const rem = i % 5;
    pubPromises.push(pub.publish(pubTopicMap[rem]!, Uint8Array.of(0xDD, i)));
    pubExpectedResults.push(rem === 4 ? "rejected" : "fulfilled");
  }

  const subscribeAndCollect = (subscriber: PrpsSubscriber, topic: Name) => {
    const sub = subscriber.subscribe(topic);
    const nums: number[] = [];
    sub.addEventListener("update", ({ detail: data }) => {
      expect(data.content).toHaveLength(2);
      expect(data.content[0]).toBe(0xDD);
      nums.push(data.content[1]);
    });
    return [sub, nums] as const;
  };

  const [sub0A, data0A] = subscribeAndCollect(sub0, topicA);
  const [sub0B, data0B] = subscribeAndCollect(sub0, topicB);
  const [sub1A, data1A] = subscribeAndCollect(sub1, topicA);
  const [pubResults] = await Promise.all([
    Promise.allSettled(pubPromises),
    (async () => {
      using closers = new Closers(sub0A, sub0B, sub1A);
      await delay(3000);
    })(),
  ]);

  expect(data0A.length).toBeLessThanOrEqual(40);
  expect(data1A.length).toBeLessThanOrEqual(40);
  expect(data0A.length + data1A.length).toBeGreaterThanOrEqual(40);
  expect(data0B.length).toBeGreaterThanOrEqual(40);
  expect(data0B.length).toBeLessThan(60);
  expect(pubResults.map(({ status }) => status)).toEqual(pubExpectedResults);
});
