import "@ndn/packet/test-fixture/expect";

import { Forwarder } from "@ndn/fw";
import { generateSigningKey } from "@ndn/keychain";
import { Data, Interest, type NameLike } from "@ndn/packet";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { consume, produce, type Producer, type ProducerHandler } from "..";

afterEach(Forwarder.deleteDefault);

describe("unsatisfied", () => {
  let pAbort: AbortController;
  const pHandler = vi.fn<Parameters<ProducerHandler>, ReturnType<ProducerHandler>>(
    async (interest) => new Data(interest.name),
  );
  let p: Producer;
  beforeEach(() => {
    pAbort = new AbortController();
    pHandler.mockReset();
  });

  const expectTimeout = async (name: NameLike) => {
    await expect(consume(new Interest(name, Interest.Lifetime(100)))).rejects.toThrow(/expire/);
  };

  describe("with route", () => {
    beforeEach(() => {
      p = produce("/A", pHandler, { signal: pAbort.signal });
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
      pAbort.abort();
      await expectTimeout("/A/3");
      expect(pHandler).not.toHaveBeenCalled();
    });
  });

  describe("without route", () => {
    beforeEach(() => {
      p = produce(undefined, pHandler, { signal: pAbort.signal });
    });

    test("Data no route", async () => {
      await expectTimeout("/A/4");
      expect(pHandler).not.toHaveBeenCalled();
    });
  });
});

test("auto signing", async () => {
  const [signer0, verifier0] = await generateSigningKey("/K0");
  const [signer1, verifier1] = await generateSigningKey("/K1");
  produce("/A", async (interest, { dataBuffer }) => {
    if (interest.name.equals("/A/0")) {
      const data = new Data("/A/0");
      await signer0.sign(data);
      return data;
    }

    return new Data("/A/1"); // signed by signer1
  }, { dataSigner: signer1 });

  await expect(consume("/A/0", { verifier: verifier0 })).resolves.toHaveName("/A/0");
  await expect(consume("/A/1", { verifier: verifier1 })).resolves.toHaveName("/A/1");
});

// dataBuffer tests are in pkg/repo/tests/endpoint-producer.t.ts
