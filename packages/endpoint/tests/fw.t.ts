import "@ndn/packet/test-fixture/expect";

import { CancelInterest, Forwarder, FwPacket, FwTracer } from "@ndn/fw";
import { NoopFace } from "@ndn/fw/test-fixture/noop-face";
import { Data, FwHint, Interest, Name } from "@ndn/packet";
import { getDataFullName } from "@ndn/packet/test-fixture/name";
import { fromUtf8 } from "@ndn/util";
import { Console } from "node:console";
import { setTimeout as delay } from "node:timers/promises";
import { BufferWritableMock } from "stream-mock";
import { consume } from "streaming-iterables";
import { afterEach, beforeEach, expect, test } from "vitest";

import { Endpoint } from "..";

let fw: Forwarder;
let ep: Endpoint;

function initForwarder(dataNoTokenMatch = false): void {
  fw = Forwarder.create({ dataNoTokenMatch });
  ep = new Endpoint({ fw, retx: 0 });
}

beforeEach(() => initForwarder());
afterEach(() => Forwarder.deleteDefault());

test("simple", async () => {
  const dataDigest = new Data("/P/digest", Uint8Array.of(0xE0, 0xE1));
  const nameDigest = await getDataFullName(dataDigest);
  const nameWrongDigest = await getDataFullName(new Data("/P/wrong-digest", Uint8Array.of(0xC0)));

  const producerP = ep.produce("/P",
    async (interest) => {
      await delay(2);
      const name = interest.name.toString();
      switch (name) {
        case "/8=P/8=prefix":
        case "/8=P/8=no-prefix":
          return new Data(interest.name.append("suffix"));
        case "/8=P/8=fresh":
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
    });

  const producerQ = ep.produce("/Q",
    async (interest) => {
      await delay(120);
      return new Data(interest.name);
    });

  const abort = new AbortController();
  const canceledInterest = ep.consume("/Q/canceled", { signal: abort.signal });
  setTimeout(() => abort.abort(), 50);
  await Promise.all([
    expect(ep.consume("/O/no-route", { modifyInterest: { lifetime: 500 } }))
      .rejects.toThrow(),
    expect(ep.consume("/P/exact"))
      .resolves.toBeInstanceOf(Data),
    expect(ep.consume("/P/prefix", { modifyInterest: { canBePrefix: true } }))
      .resolves.toBeInstanceOf(Data),
    expect(ep.consume("/P/no-prefix", { modifyInterest: { lifetime: 500 } }))
      .rejects.toThrow(),
    expect(ep.consume("/P/fresh", { modifyInterest: { mustBeFresh: true } }))
      .resolves.toBeInstanceOf(Data),
    expect(ep.consume("/P/no-fresh", { modifyInterest: { mustBeFresh: true, lifetime: 500 } }))
      .rejects.toThrow(),
    expect(ep.consume("/Q/exact"))
      .resolves.toBeInstanceOf(Data),
    expect(ep.consume("/Q/too-slow", { modifyInterest: { lifetime: 100 } }))
      .rejects.toThrow(),
    expect(ep.consume(nameDigest))
      .resolves.toBeInstanceOf(Data),
    expect(ep.consume(nameWrongDigest, { modifyInterest: { lifetime: 500 } }))
      .rejects.toThrow(),
    expect(canceledInterest)
      .rejects.toThrow(),
  ]);

  await delay(50);
  expect(fw.faces.size).toBe(2);
  producerP.close();
  producerQ.close();
  expect(fw.faces.size).toBe(0);
});

test("aggregate & retransmit", async () => {
  const producedNames = new Set<string>();
  ep.produce("/P",
    async (interest) => {
      if (producedNames.has(interest.name.valueHex)) {
        return undefined;
      }
      producedNames.add(interest.name.valueHex);
      await delay(100);
      return new Data("/P/Q/R/S");
    },
    { concurrency: 8 });

  const rxDataTokens = new Set<number>();
  let nRxRejects = 0;
  const face = fw.addFace({
    rx: (async function*() {
      yield FwPacket.create(new Interest("/P/Q/R", Interest.CanBePrefix, Interest.Nonce(0xC91585F2)), 1);
      yield FwPacket.create(new Interest("/P", Interest.CanBePrefix), 4);
      yield FwPacket.create(new Interest("/L", Interest.Lifetime(100)), 5); // no route other than self
      await delay(20);
      yield FwPacket.create(new Interest("/P/Q/R", Interest.CanBePrefix, Interest.Nonce(0x7B5BD99A)), 2);
      yield FwPacket.create(new Interest("/P/Q/R/S", Interest.Lifetime(400)), 3);
      yield new CancelInterest(new Interest("/P", Interest.CanBePrefix)); // cancel 4
      yield new CancelInterest(new Interest("/P/Q", Interest.CanBePrefix)); // no PitDn
      yield new CancelInterest(new Interest("/P/Q/R/S", Interest.MustBeFresh)); // no PitEntry
      await delay(120);
    })(),
    async tx(iterable) {
      for await (const { l3, reject, token: tokenU } of iterable) {
        const token = (tokenU as number | undefined) ?? -1;
        if (l3 instanceof Data) {
          expect(rxDataTokens.has(token)).toBeFalsy();
          rxDataTokens.add(token);
        } else if (reject) {
          switch (token) {
            case 4:
              expect(reject).toBe("cancel");
              break;
            case 5:
              expect(reject).toBe("expire");
              break;
            default:
              expect(true).toBeFalsy();
              break;
          }
          ++nRxRejects;
        } else {
          expect(true).toBeFalsy();
        }
      }
    },
  });
  face.addRoute("/L");

  await Promise.all([
    expect(ep.consume(new Interest("/P/Q", Interest.CanBePrefix)))
      .resolves.toBeInstanceOf(Data),
    expect(ep.consume(new Interest("/P/Q", Interest.CanBePrefix)))
      .resolves.toBeInstanceOf(Data),
    expect(ep.consume("/P/Q/R/S"))
      .resolves.toBeInstanceOf(Data),
    delay(200),
  ]);

  expect(rxDataTokens.size).toBe(2);
  expect(rxDataTokens.has(2)).toBeTruthy();
  expect(rxDataTokens.has(3)).toBeTruthy();
  expect(nRxRejects).toBe(2);
});

test("FwHint", async () => {
  fw.nodeNames.push(new Name("/B/n"));
  ep.produce("/A", async (interest) => {
    expect(interest).toHaveName("/C");
    return new Data(interest.name.append("A"));
  });
  ep.produce("/C", async (interest) => {
    expect(interest).toHaveName("/C");
    return new Data(interest.name.append("B"));
  });

  await expect(ep.consume(new Interest("/C", Interest.CanBePrefix, new FwHint("/A"))))
    .resolves.toHaveName("/C/A");
  await expect(ep.consume(new Interest("/C", Interest.CanBePrefix, new FwHint("/B"))))
    .resolves.toHaveName("/C/B");
});

test("Data without token", async () => {
  initForwarder(true);

  const face = fw.addFace({
    rx: (async function*() {
      await delay(50);
      yield FwPacket.create(new Data("/P/Q/R/S", Data.FreshnessPeriod(500)));
    })(),
    tx: consume,
  });
  face.addRoute("/P");

  await Promise.all([
    expect(ep.consume(new Interest("/P/Q", Interest.CanBePrefix)))
      .resolves.toBeInstanceOf(Data),
    expect(ep.consume(new Interest("/P/Q", Interest.CanBePrefix, Interest.MustBeFresh)))
      .resolves.toBeInstanceOf(Data),
    expect(ep.consume("/P/Q/R/S"))
      .resolves.toBeInstanceOf(Data),
    expect(ep.consume(new Interest("/P/Q/R/S", Interest.CanBePrefix)))
      .resolves.toBeInstanceOf(Data),
    expect(ep.consume(new Interest("/P/Q/R/S", Interest.MustBeFresh)))
      .resolves.toBeInstanceOf(Data),
  ]);
});

test("tracer", async () => {
  const output = new BufferWritableMock();
  const tracer = FwTracer.enable({
    output: new Console(output),
    fw,
  });
  const abort = new AbortController();
  const consumerA = ep.consume("/A", { signal: abort.signal });
  abort.abort();
  await expect(consumerA).rejects.toThrow();

  const producerB = ep.produce("/B", async () => new Data("/B/1", Data.FreshnessPeriod(1000)));
  await ep.consume(new Interest("/B", Interest.CanBePrefix, Interest.MustBeFresh));
  producerB.close();

  const faceC = fw.addFace(new NoopFace());
  faceC.addRoute("/C");
  faceC.removeRoute("/C");
  tracer.disable();
  faceC.close();

  await new Promise((r) => output.end(r));
  expect(fromUtf8(output.flatData).split("\n")).toEqual([
    "+Face consume(/8=A)",
    "consume(/8=A) >I /8=A",
    "consume(/8=A) >Cancel /8=A",
    "consume(/8=A) <Reject(cancel) /8=A",
    "+Face produce(/8=B)",
    "produce(/8=B) +Prefix /8=B",
    "+Announcement /8=B",
    "+Face consume(/8=B)",
    "consume(/8=B) >I /8=B[P][F]",
    "-Face consume(/8=A)",
    "produce(/8=B) <I /8=B[P][F]",
    "produce(/8=B) >D /8=B/8=1",
    "consume(/8=B) <D /8=B/8=1",
    "-Announcement /8=B",
    "-Face produce(/8=B)",
    "+Face NoopFace",
    "NoopFace +Prefix /8=C",
    "+Announcement /8=C",
    "-Announcement /8=C",
    "NoopFace -Prefix /8=C",
    "",
  ]);
});
