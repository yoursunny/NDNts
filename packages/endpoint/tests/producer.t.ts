import "@ndn/packet/test-fixture/expect";

import { generateSigningKey } from "@ndn/keychain";
import { Data, Interest } from "@ndn/packet";
import { makeDataStore } from "@ndn/repo/test-fixture/data-store";

import { DataStoreBuffer, Endpoint, Options, Producer, ProducerHandler } from "..";

afterEach(() => Endpoint.deleteDefaultForwarder());

async function makeEndpointBuffered(autoBuffer?: boolean, bo?: DataStoreBuffer.Options, eo?: Options): Promise<[Endpoint, DataStoreBuffer]> {
  const dataStoreBuffer = new DataStoreBuffer(await makeDataStore(), bo);
  const ep = new Endpoint({ ...eo, dataBuffer: dataStoreBuffer, autoBuffer });
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
  const [ep, dataStoreBuffer] = await makeEndpointBuffered();
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

  await expect(ep.consume("/A/1")).resolves.toHaveName("/A/1");
  await expect(ep.consume("/A/2")).resolves.toHaveName("/A/2");
  expect(handler).toHaveBeenCalledTimes(1);
});

test("prefill buffer", async () => {
  const [ep, dataStoreBuffer] = await makeEndpointBuffered();
  const handler = jest.fn(async (interest: Interest) => {
    return new Data(interest.name);
  });
  ep.produce("/A", handler);

  await dataStoreBuffer.insert(new Data("/A/0"), new Data("/A/1"));
  await expect(ep.consume("/A/0")).resolves.toHaveName("/A/0");
  expect(handler).toHaveBeenCalledTimes(0);

  await expect(ep.consume("/A/2")).resolves.toHaveName("/A/2");
  expect(handler).toHaveBeenCalledTimes(1);
});

test.each([false, true])("autoBuffer %p", async (autoBuffer) => {
  const [ep] = await makeEndpointBuffered(autoBuffer);
  const handler = jest.fn(async (interest: Interest, { dataBuffer }: Producer) => {
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
  const handler = jest.fn(async (interest: Interest) => {
    if (!interest.name.equals("/A")) { return false; }
    return new Data("/A/0");
  });
  ep.produce("/A", handler);

  await expect(ep.consume(new Interest("/A", Interest.CanBePrefix))).resolves.toHaveName("/A/0");
  expect(handler).toHaveBeenCalledTimes(1);

  await new Promise((r) => setTimeout(r, 30));
  await expect(ep.consume("/A/0")).resolves.toHaveName("/A/0");
  expect(handler).toHaveBeenCalledTimes(1);

  await new Promise((r) => setTimeout(r, 130));
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
