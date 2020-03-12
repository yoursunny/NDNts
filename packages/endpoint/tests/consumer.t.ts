import "@ndn/packet/test-fixture/expect";

import { Data, Interest } from "@ndn/packet";

import { Endpoint, ProducerHandler, RetxPolicy } from "..";

let ep: Endpoint;
beforeEach(() => ep = new Endpoint());
afterEach(() => Endpoint.deleteDefaultForwarder());

describe("retx limit", () => {
  let producer: jest.Mock<ReturnType<ProducerHandler>, Parameters<ProducerHandler>>;

  beforeEach(() => {
    producer = jest.fn<ReturnType<ProducerHandler>, Parameters<ProducerHandler>>()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(new Data("/A"));
    ep.produce("/A", producer);
  });

  test("resolve", async () => {
    const promise = ep.consume(
      new Interest("/A", Interest.Lifetime(500)),
      {
        retx: {
          limit: 2,
          interval: 50,
        },
      },
    );
    await expect(promise).resolves.toBeInstanceOf(Data);
    expect(producer).toHaveBeenCalledTimes(3);
    expect(promise.nRetx).toBe(2);
  });

  test.each<[RetxPolicy, number]>([
    [{}, 1],
    [{ limit: 1, interval: 50 }, 2],
    [function*() { yield 60; }, 2], // retx before timeout
    [function*() { yield 400; }, 2], // retx after timeout
    [0, 1],
    [1, 2],
    [null, 1],
  ])("reject %#", async (retx, nInterests) => {
    const promise = ep.consume(
      new Interest("/A", Interest.Lifetime(200)),
      { retx },
    );
    await expect(promise).rejects.toThrow();
    expect(producer).toHaveBeenCalledTimes(nInterests);
    expect(promise.nRetx).toBe(nInterests - 1);
  });

  test("cancel", async () => {
    const promise = ep.consume(
      new Interest("/A", Interest.Lifetime(2000)),
      {
        retx: {
          limit: 2,
        },
      });
    setTimeout(() => promise.cancel(), 100);
    await expect(promise).rejects.toThrow();
    expect(producer).toHaveBeenCalledTimes(1);
    expect(promise.nRetx).toBe(0);
  });
});
