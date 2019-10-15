import { Data, Interest } from "@ndn/l3pkt";
import { getDataFullName } from "@ndn/l3pkt/test-fixture";
import { Name } from "@ndn/name";
import "@ndn/name/test-fixture";

import { CancelInterest, Forwarder, FwFace, InterestToken, RejectInterest } from "../src";
import { SimpleEndpoint } from "../src/simple-endpoint";

test("simple", async () => {
  const fw = Forwarder.create();
  const se = new SimpleEndpoint(fw);

  const dataDigest = new Data("/P/digest", Uint8Array.of(0xE0, 0xE1));
  const nameDigest = await getDataFullName(dataDigest);
  const nameWrongDigest = await getDataFullName(new Data("/P/wrong-digest", Uint8Array.of(0xC0)));

  const producerP = se.produce({
    prefix: new Name("/P"),
    async handler(interest) {
      await new Promise((r) => setTimeout(r, 2));
      const name = interest.name.toString();
      switch (name) {
        case "/P/prefix":
        case "/P/no-prefix":
          return new Data(interest.name.append("suffix"));
        case "/P/fresh":
          return new Data("/P/fresh", Data.FreshnessPeriod(1000));
        default:
          if (nameDigest.equals(interest.name)) {
            return dataDigest;
          }
          if (nameWrongDigest.equals(interest.name)) {
            return new Data("/P/wrong-digest", Uint8Array.of(0xC1));
          }
          return new Data(interest.name);
      }
    },
  });

  const producerQ = se.produce({
    prefix: new Name("/Q"),
    async handler(interest) {
      await new Promise((r) => setTimeout(r, 120));
      return new Data(interest.name);
    },
  });

  const canceledInterest = se.consume(new Interest("/Q/canceled"));
  setTimeout(() => canceledInterest.cancel(), 10);
  await Promise.all([
    expect(se.consume(new Interest("/P/exact")))
      .resolves.toBeInstanceOf(Data),
    expect(se.consume(new Interest("/P/prefix", Interest.CanBePrefix)))
      .resolves.toBeInstanceOf(Data),
    expect(se.consume(new Interest("/P/no-prefix", Interest.Lifetime(500))))
      .rejects.toThrow(),
    expect(se.consume(new Interest("/P/fresh", Interest.MustBeFresh)))
      .resolves.toBeInstanceOf(Data),
    expect(se.consume(new Interest("/P/no-fresh", Interest.MustBeFresh, Interest.Lifetime(500))))
      .rejects.toThrow(),
    expect(se.consume(new Interest("/Q/exact")))
      .resolves.toBeInstanceOf(Data),
    expect(se.consume(new Interest("/Q/too-slow", Interest.Lifetime(100))))
      .rejects.toThrow(),
    expect(se.consume(new Interest(nameDigest)))
      .resolves.toBeInstanceOf(Data),
    expect(se.consume(new Interest(nameWrongDigest, Interest.Lifetime(500))))
      .rejects.toThrow(),
    expect(canceledInterest)
      .rejects.toThrow(),
  ]);

  await new Promise((r) => setTimeout(r, 50));
  expect(fw.faces.size).toBe(2);
  producerP.close();
  producerQ.close();
  expect(fw.faces.size).toBe(0);
});

test("aggregate & retransmit", async () => {
  const fw = Forwarder.create();
  const se = new SimpleEndpoint(fw);

  let producedP = false;
  se.produce({
    prefix: new Name("/P"),
    async handler(interest) {
      if (producedP) {
        return SimpleEndpoint.TIMEOUT;
      }
      producedP = true;
      await new Promise((r) => setTimeout(r, 100));
      return new Data("/P/Q/R/S");
    },
  });

  let nRxData = 0;
  let nRxRejects = 0;
  fw.addFace({
    rxtx: {
      rx: (async function*() {
        yield InterestToken.set(new Interest("/P/Q/R", Interest.CanBePrefix, Interest.Nonce(0xC91585F2)), 1);
        yield InterestToken.set(new Interest("/P", Interest.CanBePrefix), 4);
        await new Promise((r) => setTimeout(r, 20));
        yield InterestToken.set(new Interest("/P/Q/R", Interest.CanBePrefix, Interest.Nonce(0x7B5BD99A)), 2);
        yield InterestToken.set(new Interest("/P/Q/R/S", Interest.Lifetime(400)), 3);
        yield new CancelInterest(new Interest("/P", Interest.CanBePrefix)); // cancel 4
        yield new CancelInterest(new Interest("/P/Q", Interest.CanBePrefix)); // no PitDn
        yield new CancelInterest(new Interest("/P/Q/R/S", Interest.MustBeFresh)); // no PitEntry
        await new Promise((r) => setTimeout(r, 120));
      })(),
      async tx(iterable) {
        for await (const pkt of iterable) {
          if (pkt instanceof Data) {
            const data = pkt as FwFace.DataResponse;
            const tokens = new Set(InterestToken.get(data));
            expect(tokens.has(1)).toBeFalsy();
            expect(tokens.has(2)).toBeTruthy();
            expect(tokens.has(3)).toBeTruthy();
            ++nRxData;
          } else if (pkt instanceof RejectInterest) {
            const rej = pkt as RejectInterest;
            expect(rej.reason).toBe("cancel");
            expect(InterestToken.get(rej)).toBe(4);
            ++nRxRejects;
          } else {
            expect(true).toBeFalsy();
          }
        }
      },
    },
  });

  await Promise.all([
    expect(se.consume(new Interest("/P/Q", Interest.CanBePrefix)))
      .resolves.toBeInstanceOf(Data),
    expect(se.consume(new Interest("/P/Q", Interest.CanBePrefix)))
      .resolves.toBeInstanceOf(Data),
    expect(se.consume(new Interest("/P/Q/R/S")))
      .resolves.toBeInstanceOf(Data),
  ]);

  expect(nRxData).toBe(1);
  expect(nRxRejects).toBe(1);
});
