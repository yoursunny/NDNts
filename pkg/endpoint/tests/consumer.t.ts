import "@ndn/packet/test-fixture/expect";

import { Forwarder } from "@ndn/fw";
import { Data, Interest, type Verifier } from "@ndn/packet";
import { delay } from "@ndn/util";
import { afterEach, beforeEach, describe, expect, type Mock, test, vi } from "vitest";

import { consume, produce, type ProducerHandler, type RetxPolicy } from "..";

afterEach(Forwarder.deleteDefault);

describe("retx limit", () => {
  let producer: Mock<ProducerHandler>;

  beforeEach(() => {
    producer = vi.fn<ProducerHandler>()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(new Data("/A"));
    produce("/A", producer);
  });

  test("resolve", async () => {
    const consumer = consume(
      new Interest("/A", Interest.Lifetime(500)),
      {
        retx: {
          limit: 2,
          interval: 50,
        },
      },
    );
    await expect(consumer).resolves.toBeInstanceOf(Data);
    expect(producer).toHaveBeenCalledTimes(3);
    expect(consumer.nRetx).toBe(2);
  });

  test.each<[RetxPolicy, number]>([
    [{}, 1],
    [{ limit: 1, interval: 50 }, 2],
    [function*() { yield 60; }, 2], // retx before timeout
    [function*() { yield 400; }, 2], // retx after timeout
    [0, 1],
    [1, 2],
  ])("reject %#", async (retx, nInterests) => {
    const consumer = consume(
      new Interest("/A", Interest.Lifetime(200)),
      { retx },
    );
    await expect(consumer).rejects.toThrow();
    expect(producer).toHaveBeenCalledTimes(nInterests);
    expect(consumer.nRetx).toBe(nInterests - 1);
  });

  test("abort", async () => {
    const consumer = consume(
      new Interest("/A", Interest.Lifetime(2000)),
      {
        signal: AbortSignal.timeout(100),
        retx: {
          limit: 2,
        },
      },
    );
    await expect(consumer).rejects.toThrow();
    expect(producer).toHaveBeenCalledTimes(1);
    expect(consumer.nRetx).toBe(0);
  });
});

test("RTT", async () => {
  produce("/A", async () => {
    await delay(200);
    return new Data("/A");
  });

  const consumer = consume(
    new Interest("/A", Interest.Lifetime(400)),
    { verifier: { async verify() { await delay(400); } } },
  );
  expect(consumer.rtt).toBeUndefined();

  await expect(consumer).resolves.toBeInstanceOf(Data);
  expect(consumer.rtt).toBeGreaterThanOrEqual(200);
  expect(consumer.rtt).toBeLessThanOrEqual(400);
});

test("verify", async () => {
  const producer = vi.fn<ProducerHandler>().mockResolvedValueOnce(new Data("/A"));
  produce("/A", producer);

  const verify = vi.fn<Verifier["verify"]>().mockRejectedValue(new Error("mock-verify-error"));
  const consumer = consume(
    new Interest("/A", Interest.Lifetime(200)),
    { verifier: { verify } },
  );
  await expect(consumer).rejects.toThrow(/mock-verify-error/);
  expect(producer).toHaveBeenCalledTimes(1);
});
