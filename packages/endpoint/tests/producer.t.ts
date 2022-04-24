import "@ndn/packet/test-fixture/expect";

import { generateSigningKey } from "@ndn/keychain";
import { type NameLike, Data, Interest } from "@ndn/packet";
import { makeDataStore } from "@ndn/repo/test-fixture/data-store";
import { setTimeout as delay } from "node:timers/promises";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { type Options, DataStoreBuffer, Endpoint, Producer, ProducerHandler } from "..";

afterEach(() => Endpoint.deleteDefaultForwarder());

async function makeEndpointBuffered(autoBuffer?: boolean, bo?: DataStoreBuffer.Options, eo?: Options): Promise<[Endpoint, DataStoreBuffer]> {
  const dataStoreBuffer = new DataStoreBuffer(await makeDataStore(), bo);
  const ep = new Endpoint({ ...eo, dataBuffer: dataStoreBuffer, autoBuffer });
  return [ep, dataStoreBuffer];
}

describe("unsatisfied", () => {
  let pAbort: AbortController;
  let pEndpoint: Endpoint;
  const pHandler = vi.fn<Parameters<ProducerHandler>, ReturnType<ProducerHandler>>(
    async (interest) => new Data(interest.name));
  let p: Producer;
  let cEndpoint: Endpoint;
  beforeEach(() => {
    pAbort = new AbortController();
    pEndpoint = new Endpoint({ signal: pAbort.signal });
    pHandler.mockReset();
    cEndpoint = new Endpoint();
  });

  const expectTimeout = async (name: NameLike) => {
    await expect(cEndpoint.consume(new Interest(name, Interest.Lifetime(100)))).rejects.toThrow(/expire/);
  };

  describe("with route", () => {
    beforeEach(() => {
      p = pEndpoint.produce("/A", pHandler);
    });

    test("Data non-match", async () => {
      pHandler.mockResolvedValue(new Data("/A/0"));
      await expectTimeout("/A/9");
      expect(pHandler).toHaveBeenCalledTimes(1);
    });

    test("handler throws", async () => {
      pHandler.mockRejectedValue(new Error("mock error"));
      await expectTimeout("/A/1");
      expect(pHandler).toHaveBeenCalledTimes(1);
    });

    test("producer closed", async () => {
      p.close();
      await expectTimeout("/A/2");
      expect(pHandler).not.toHaveBeenCalled();
    });

    test("producer aborted", async () => {
      p.close();
      await expectTimeout("/A/3");
      expect(pHandler).not.toHaveBeenCalled();
    });
  });

  describe("without route", () => {
    beforeEach(() => {
      p = pEndpoint.produce(undefined, pHandler);
    });

    test("Data no route", async () => {
      await expectTimeout("/A/4");
      expect(pHandler).not.toHaveBeenCalled();
    });
  });
});

test("fill buffer in handler", async () => {
  const [ep, dataStoreBuffer] = await makeEndpointBuffered();
  const handler = vi.fn<Parameters<ProducerHandler>, ReturnType<ProducerHandler>>(
    async (interest: Interest, { dataBuffer }: Producer) => {
      expect(dataBuffer).toBe(dataStoreBuffer);
      if (!interest.name.equals("/A")) { return undefined; }
      await dataBuffer!.insert(new Data("/A/0"), new Data("/A/1"), new Data("/A/2"));
      return undefined;
    });
  ep.produce("/A", handler);

  await expect(ep.consume(new Interest("/A", Interest.CanBePrefix))).resolves.toHaveName("/A/0");
  expect(handler).toHaveBeenCalledTimes(1);

  await expect(ep.consume(new Interest("/A", Interest.CanBePrefix))).resolves.toHaveName("/A/0");
  expect(handler).toHaveBeenCalledTimes(1);

  await expect(ep.consume("/A/1")).resolves.toHaveName("/A/1");
  await expect(ep.consume("/A/2")).resolves.toHaveName("/A/2");
  expect(handler).toHaveBeenCalledTimes(1);
});

test("prefill buffer", async () => {
  const [ep, dataStoreBuffer] = await makeEndpointBuffered();
  const handler = vi.fn(async (interest: Interest) => new Data(interest.name));
  const producer = ep.produce(undefined, handler);
  producer.face.addRoute("/A");

  await dataStoreBuffer.insert(new Data("/A/0"), new Data("/A/1"));
  await expect(producer.processInterest(new Interest("/A/0"))).resolves.toHaveName("/A/0");
  await expect(ep.consume("/A/0")).resolves.toHaveName("/A/0");
  expect(handler).toHaveBeenCalledTimes(0);

  await expect(ep.consume("/A/2")).resolves.toHaveName("/A/2");
  expect(handler).toHaveBeenCalledTimes(1);
});

test.each([false, true])("autoBuffer %j", async (autoBuffer) => {
  const [ep] = await makeEndpointBuffered(autoBuffer);
  const handler = vi.fn(async (interest: Interest, { dataBuffer }: Producer) => {
    await dataBuffer!.insert(new Data("/A/1"));
    return new Data("/A/0");
  });
  ep.produce("/A", handler);

  await expect(ep.consume("/A/0")).resolves.toHaveName("/A/0");
  expect(handler).toHaveBeenCalledTimes(1);

  await expect(ep.consume("/A/1")).resolves.toHaveName("/A/1");
  expect(handler).toHaveBeenCalledTimes(1);

  await expect(ep.consume("/A/0")).resolves.toHaveName("/A/0");
  expect(handler).toHaveBeenCalledTimes(autoBuffer ? 1 : 2);
});

test("buffer expire", async () => {
  const [ep] = await makeEndpointBuffered(undefined, { ttl: 150 });
  const handler = vi.fn(async (interest: Interest) => {
    if (!interest.name.equals("/A")) { return undefined; }
    return new Data("/A/0");
  });
  ep.produce("/A", handler);

  await expect(ep.consume(new Interest("/A", Interest.CanBePrefix))).resolves.toHaveName("/A/0");
  expect(handler).toHaveBeenCalledTimes(1);

  await delay(30);
  await expect(ep.consume("/A/0")).resolves.toHaveName("/A/0");
  expect(handler).toHaveBeenCalledTimes(1);

  await delay(130);
  await expect(ep.consume(new Interest("/A/0", Interest.Lifetime(100)))).rejects.toThrow();
  expect(handler).toHaveBeenCalledTimes(2);
});

test("auto signing", async () => {
  const [signer0, verifier0] = await generateSigningKey("/K0");
  const [signer1, verifier1] = await generateSigningKey("/K1");
  const [signer2, verifier2] = await generateSigningKey("/K2");
  const [ep] = await makeEndpointBuffered(true, { dataSigner: signer2 }, { dataSigner: signer1 });
  ep.produce("/A", async (interest, { dataBuffer }) => {
    if (interest.name.equals("/A/0")) {
      const data = new Data("/A/0");
      await signer0.sign(data);
      return data;
    }

    await dataBuffer!.insert(new Data("/A/2")); // signed by signer2
    return new Data("/A/1"); // signed by signer1
  });

  await expect(ep.consume("/A/0", { verifier: verifier0 })).resolves.toHaveName("/A/0");
  await expect(ep.consume("/A/1", { verifier: verifier1 })).resolves.toHaveName("/A/1");
  await expect(ep.consume("/A/2", { verifier: verifier2 })).resolves.toHaveName("/A/2");
});
