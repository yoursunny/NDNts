import "@ndn/packet/test-fixture/expect";

import { consume, DataStoreBuffer, produce, type Producer, type ProducerHandler, type ProducerOptions } from "@ndn/endpoint";
import { Forwarder } from "@ndn/fw";
import { generateSigningKey } from "@ndn/keychain";
import { Data, Interest } from "@ndn/packet";
import { delay } from "@ndn/util";
import { afterEach, expect, test, vi } from "vitest";

import { makeInMemoryDataStore } from "..";

afterEach(Forwarder.deleteDefault);

async function makeBufferedProducer(bo?: DataStoreBuffer.Options, po?: ProducerOptions): Promise<ProducerOptions> {
  const dataBuffer = new DataStoreBuffer(await makeInMemoryDataStore(), bo);
  return { ...po, dataBuffer };
}

test("fill buffer in handler", async () => {
  const pOpts = await makeBufferedProducer();
  const handler = vi.fn(async (interest: Interest, { dataBuffer }: Producer) => {
    expect(dataBuffer).toBe(pOpts.dataBuffer);
    if (!interest.name.equals("/A")) {
      return undefined;
    }
    await dataBuffer!.insert(new Data("/A/0"), new Data("/A/1"), new Data("/A/2"));
    return undefined;
  });
  produce("/A", handler, pOpts);

  await expect(consume(new Interest("/A", Interest.CanBePrefix))).resolves.toHaveName("/A/0");
  expect(handler).toHaveBeenCalledTimes(1);

  await expect(consume(new Interest("/A", Interest.CanBePrefix))).resolves.toHaveName("/A/0");
  expect(handler).toHaveBeenCalledTimes(1);

  await expect(consume("/A/1")).resolves.toHaveName("/A/1");
  await expect(consume("/A/2")).resolves.toHaveName("/A/2");
  expect(handler).toHaveBeenCalledTimes(1);
});

test("prefill buffer", async () => {
  const pOpts = await makeBufferedProducer();
  const handler = vi.fn(async (interest: Interest) => new Data(interest.name));
  const producer = produce(undefined, handler, pOpts);
  producer.face.addRoute("/A");

  await pOpts.dataBuffer!.insert(new Data("/A/0"), new Data("/A/1"));
  await expect(producer.processInterest(new Interest("/A/0"))).resolves.toHaveName("/A/0");
  await expect(consume("/A/0")).resolves.toHaveName("/A/0");
  expect(handler).toHaveBeenCalledTimes(0);

  await expect(consume("/A/2")).resolves.toHaveName("/A/2");
  expect(handler).toHaveBeenCalledTimes(1);
});

test.each([false, true])("autoBuffer %j", async (autoBuffer) => {
  const pOpts = await makeBufferedProducer(undefined, { autoBuffer });
  const handler = vi.fn(async (interest: Interest, { dataBuffer }: Producer) => {
    void interest;
    await dataBuffer!.insert(new Data("/A/1"));
    return new Data("/A/0");
  });
  produce("/A", handler, pOpts);

  await expect(consume("/A/0")).resolves.toHaveName("/A/0");
  expect(handler).toHaveBeenCalledTimes(1);

  await expect(consume("/A/1")).resolves.toHaveName("/A/1");
  expect(handler).toHaveBeenCalledTimes(1);

  await expect(consume("/A/0")).resolves.toHaveName("/A/0");
  expect(handler).toHaveBeenCalledTimes(autoBuffer ? 1 : 2);
});

test("buffer expire", async () => {
  const pOpts = await makeBufferedProducer({ ttl: 150 });
  const handler = vi.fn(async (interest: Interest) => {
    if (!interest.name.equals("/A")) {
      return undefined;
    }
    return new Data("/A/0");
  });
  produce("/A", handler, pOpts);

  await expect(consume(new Interest("/A", Interest.CanBePrefix))).resolves.toHaveName("/A/0");
  expect(handler).toHaveBeenCalledTimes(1);

  await delay(30);
  await expect(consume("/A/0")).resolves.toHaveName("/A/0");
  expect(handler).toHaveBeenCalledTimes(1);

  await delay(130);
  await expect(consume(new Interest("/A/0", Interest.Lifetime(100)))).rejects.toThrow();
  expect(handler).toHaveBeenCalledTimes(2);
});

test("auto signing", async () => {
  const [signer0, verifier0] = await generateSigningKey("/K0");
  const [signer1, verifier1] = await generateSigningKey("/K1");
  const [signer2, verifier2] = await generateSigningKey("/K2");
  const pOpts = await makeBufferedProducer({ dataSigner: signer2 }, { dataSigner: signer1 });
  produce("/A", async (interest, { dataBuffer }) => {
    if (interest.name.equals("/A/0")) {
      const data = new Data("/A/0");
      await signer0.sign(data);
      return data;
    }

    await dataBuffer!.insert(new Data("/A/2")); // signed by signer2
    return new Data("/A/1"); // signed by signer1
  }, pOpts);

  await expect(consume("/A/0", { verifier: verifier0 })).resolves.toHaveName("/A/0");
  await expect(consume("/A/1", { verifier: verifier1 })).resolves.toHaveName("/A/1");
  await expect(consume("/A/2", { verifier: verifier2 })).resolves.toHaveName("/A/2");
});
