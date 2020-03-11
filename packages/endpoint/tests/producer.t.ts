import { Data, Interest } from "@ndn/packet";
import "@ndn/packet/test-fixture/expect";
import { DataStore } from "@ndn/repo";
import memdown from "memdown";

import { DataStoreBuffer, Endpoint, Producer, ProducerHandler } from "..";

afterEach(() => Endpoint.deleteDefaultForwarder());

function makeEndpointBuffered(ttl?: number, autoBuffer?: boolean): [Endpoint, DataStoreBuffer] {
  const dataStoreBuffer = new DataStoreBuffer(new DataStore(memdown()), ttl);
  const ep = new Endpoint({ dataBuffer: dataStoreBuffer, autoBuffer });
  return [ep, dataStoreBuffer];
}

test("Data non-match", async () => {
  const ep = new Endpoint();
  const handler = jest.fn(async (interest: Interest) => {
    return new Data("/A/0");
  });
  ep.produce("/A", handler);

  await expect(ep.consume(new Interest("/A/9", Interest.Lifetime(100)))).rejects.toThrow();
  expect(handler).toHaveBeenCalledTimes(1);
});

test("fill buffer in handler", async () => {
  const [ep, dataStoreBuffer] = makeEndpointBuffered();
  const handler = jest.fn<ReturnType<ProducerHandler>, Parameters<ProducerHandler>>(
    async (interest: Interest, { dataBuffer }: Producer) => {
      expect(dataBuffer).toBe(dataStoreBuffer);
      if (!interest.name.equals("/A")) { return false; }
      await dataBuffer!.insert(new Data("/A/0"), new Data("/A/1"), new Data("/A/2"));
      return false;
    });
  ep.produce("/A", handler);

  await expect(ep.consume(new Interest("/A", Interest.CanBePrefix))).resolves.toHaveName("/A/0");
  expect(handler).toHaveBeenCalledTimes(1);

  await expect(ep.consume(new Interest("/A", Interest.CanBePrefix))).resolves.toHaveName("/A/0");
  expect(handler).toHaveBeenCalledTimes(1);

  await expect(ep.consume(new Interest("/A/1"))).resolves.toHaveName("/A/1");
  await expect(ep.consume(new Interest("/A/2"))).resolves.toHaveName("/A/2");
  expect(handler).toHaveBeenCalledTimes(1);
});

test("prefill buffer", async () => {
  const [ep, dataStoreBuffer] = makeEndpointBuffered();
  const handler = jest.fn(async (interest: Interest) => {
    return new Data(interest.name);
  });
  ep.produce("/A", handler);

  await dataStoreBuffer.insert(new Data("/A/0"), new Data("/A/1"));
  await expect(ep.consume(new Interest("/A/0"))).resolves.toHaveName("/A/0");
  expect(handler).toHaveBeenCalledTimes(0);

  await expect(ep.consume(new Interest("/A/2"))).resolves.toHaveName("/A/2");
  expect(handler).toHaveBeenCalledTimes(1);
});

test.each([false, true])("autoBuffer %p", async (autoBuffer) => {
  const [ep] = makeEndpointBuffered(undefined, autoBuffer);
  const handler = jest.fn(async (interest: Interest, { dataBuffer }: Producer) => {
    dataBuffer!.insert(new Data("/A/1"));
    return new Data("/A/0");
  });
  ep.produce("/A", handler);

  await expect(ep.consume(new Interest("/A/0"))).resolves.toHaveName("/A/0");
  expect(handler).toHaveBeenCalledTimes(1);

  await expect(ep.consume(new Interest("/A/1"))).resolves.toHaveName("/A/1");
  expect(handler).toHaveBeenCalledTimes(1);

  await expect(ep.consume(new Interest("/A/0"))).resolves.toHaveName("/A/0");
  expect(handler).toHaveBeenCalledTimes(autoBuffer ? 1 : 2);
});

test("buffer expire", async () => {
  const [ep] = makeEndpointBuffered(150);
  const handler = jest.fn(async (interest: Interest) => {
    if (!interest.name.equals("/A")) { return false; }
    return new Data("/A/0");
  });
  ep.produce("/A", handler);

  await expect(ep.consume(new Interest("/A", Interest.CanBePrefix))).resolves.toHaveName("/A/0");
  expect(handler).toHaveBeenCalledTimes(1);

  await new Promise((r) => setTimeout(r, 30));
  await expect(ep.consume(new Interest("/A/0"))).resolves.toHaveName("/A/0");
  expect(handler).toHaveBeenCalledTimes(1);

  await new Promise((r) => setTimeout(r, 130));
  await expect(ep.consume(new Interest("/A/0", Interest.Lifetime(100)))).rejects.toThrow();
  expect(handler).toHaveBeenCalledTimes(2);
});
