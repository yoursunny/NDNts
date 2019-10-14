import { Data, Interest } from "@ndn/l3pkt";
import { getDataFullName } from "@ndn/l3pkt/test-fixture";
import { Name } from "@ndn/name";
import "@ndn/name/test-fixture";
import { Encoder } from "@ndn/tlv";
import pushable from "it-pushable";
import { consume, map, pipeline, tap } from "streaming-iterables";

import { CancelInterest, Forwarder, Packet } from "../src";

test("InterestData", async () => {
  const fw = Forwarder.create();

  const dataDigest = new Data("/P/digest", Uint8Array.of(0xE0, 0xE1));
  const nameDigest = await getDataFullName(dataDigest);
  const nameWrongDigest = await getDataFullName(new Data("/P/wrong-digest", Uint8Array.of(0xC0)));

  const consumerTx = pushable<Packet|CancelInterest>();
  setTimeout(() => {
    consumerTx.push(new Interest("/P/exact"));
    consumerTx.push(new Interest("/P/prefix", Interest.CanBePrefix));
    consumerTx.push(new Interest("/P/no-prefix", Interest.Lifetime(500)));
    consumerTx.push(new Interest("/P/fresh", Interest.MustBeFresh));
    consumerTx.push(new Interest("/P/no-fresh", Interest.MustBeFresh, Interest.Lifetime(500)));
    consumerTx.push(new Interest("/Q/too-slow", Interest.Lifetime(100)));
    consumerTx.push(new Interest(nameDigest));
    consumerTx.push(new Interest(nameWrongDigest, Interest.Lifetime(500)));
    consumerTx.push(new Interest("/P/canceled"));
  }, 10);
  setTimeout(() => {
    consumerTx.push(new CancelInterest(new Interest("/P/canceled")));
  }, 12);
  setTimeout(() => {
    consumerTx.end();
  }, 200);
  const consumerRx = new Map<string, Data>();
  fw.addFace({
    rxtx: {
      rx: consumerTx,
      tx(iterable) {
        pipeline(
          () => iterable,
          tap((pkt) => {
            expect(pkt).toBeInstanceOf(Data);
            const data = pkt as Data;
            const name = data.name.toString();
            expect(consumerRx.has(name)).toBeFalsy();
            consumerRx.set(name, data);
          }),
          consume,
        );
      },
    },
  });

  const producerP = fw.addFace({
    rxtx(iterable) {
      return pipeline(
        () => iterable,
        map(async (pkt) => {
          expect(pkt).toBeInstanceOf(Interest);
          await new Promise((r) => setTimeout(r, 2));
          const interest = pkt as Interest;
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
        }),
        tap((pkt) => Encoder.encode(pkt)),
      );
    },
  });
  producerP.addRoute(new Name("/P"));

  const producerQ = fw.addFace({
    rxtx(iterable) {
      return pipeline(
        () => iterable,
        map(async (pkt) => {
          expect(pkt).toBeInstanceOf(Interest);
          const interest = pkt as Interest;
          expect(interest.name).toEqualName("/Q/too-slow");
          await new Promise((r) => setTimeout(r, 120));
          return new Data(interest.name);
        }),
        tap((pkt) => Encoder.encode(pkt)),
      );
    },
  });
  producerQ.addRoute(new Name("/Q"));

  await new Promise((r) => setTimeout(r, 500));
  expect(fw.faces.size).toBe(2);
  producerP.close();
  producerQ.close();
  expect(fw.faces.size).toBe(0);

  expect(Array.from(consumerRx.keys()).sort()).toEqual([
    "/P/digest",
    "/P/exact",
    "/P/fresh",
    "/P/prefix/suffix",
  ]);
});
