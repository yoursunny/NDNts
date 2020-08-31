import "@ndn/packet/test-fixture/expect";

import { CancelInterest, Forwarder, FwPacket, FwTracer } from "@ndn/fw";
import { NoopFace } from "@ndn/fw/test-fixture/noop-face";
import { Data, Interest, Name } from "@ndn/packet";
import { getDataFullName } from "@ndn/packet/test-fixture/name";
import { toHex } from "@ndn/tlv";
import { consume } from "streaming-iterables";

import { Endpoint } from "..";

let fw: Forwarder;
let ep: Endpoint;
beforeEach(() => {
  fw = Forwarder.create();
  fw.pit.dataNoTokenMatch = false;
  ep = new Endpoint({ fw, retx: 0 });
});
afterEach(() => Forwarder.deleteDefault());

test("simple", async () => {
  const dataDigest = new Data("/P/digest", Uint8Array.of(0xE0, 0xE1));
  const nameDigest = await getDataFullName(dataDigest);
  const nameWrongDigest = await getDataFullName(new Data("/P/wrong-digest", Uint8Array.of(0xC0)));

  const producerP = ep.produce("/P",
    async (interest) => {
      await new Promise((r) => setTimeout(r, 2));
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
      await new Promise((r) => setTimeout(r, 120));
      return new Data(interest.name);
    });

  const canceledInterest = ep.consume("/Q/canceled");
  setTimeout(() => canceledInterest.cancel(), 50);
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

  await new Promise((r) => setTimeout(r, 50));
  expect(fw.faces.size).toBe(2);
  producerP.close();
  producerQ.close();
  expect(fw.faces.size).toBe(0);
});

test("aggregate & retransmit", async () => {
  const producedNames = new Set<string>();
  ep.produce("/P",
    async (interest) => {
      const nameStr = toHex(interest.name.value);
      if (producedNames.has(nameStr)) {
        return false;
      }
      producedNames.add(nameStr);
      await new Promise((r) => setTimeout(r, 100));
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
      await new Promise((r) => setTimeout(r, 20));
      yield FwPacket.create(new Interest("/P/Q/R", Interest.CanBePrefix, Interest.Nonce(0x7B5BD99A)), 2);
      yield FwPacket.create(new Interest("/P/Q/R/S", Interest.Lifetime(400)), 3);
      yield new CancelInterest(new Interest("/P", Interest.CanBePrefix)); // cancel 4
      yield new CancelInterest(new Interest("/P/Q", Interest.CanBePrefix)); // no PitDn
      yield new CancelInterest(new Interest("/P/Q/R/S", Interest.MustBeFresh)); // no PitEntry
      await new Promise((r) => setTimeout(r, 120));
    })(),
    async tx(iterable) {
      for await (const { l3, reject, token: tokenU } of iterable) {
        const token = (tokenU as number|undefined) ?? -1;
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
  face.addRoute(new Name("/L"));

  await Promise.all([
    expect(ep.consume(new Interest("/P/Q", Interest.CanBePrefix)))
      .resolves.toBeInstanceOf(Data),
    expect(ep.consume(new Interest("/P/Q", Interest.CanBePrefix)))
      .resolves.toBeInstanceOf(Data),
    expect(ep.consume("/P/Q/R/S"))
      .resolves.toBeInstanceOf(Data),
    new Promise((r) => setTimeout(r, 200)),
  ]);

  expect(rxDataTokens.size).toBe(2);
  expect(rxDataTokens.has(2)).toBeTruthy();
  expect(rxDataTokens.has(3)).toBeTruthy();
  expect(nRxRejects).toBe(2);
});

test("Data without token", async () => {
  fw.pit.dataNoTokenMatch = jest.fn<boolean, [Data, string]>().mockReturnValue(true);

  const face = fw.addFace({
    rx: (async function*() {
      await new Promise((r) => setTimeout(r, 50));
      yield FwPacket.create(new Data("/P/Q/R/S", Data.FreshnessPeriod(500)));
    })(),
    tx: consume,
  });
  face.addRoute(new Name("/P"));

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

  expect(fw.pit.dataNoTokenMatch).toHaveBeenCalledTimes(5);
});

describe("tracer", () => {
  let debugFn: jest.SpyInstance<void, any[]>;
  beforeEach(() => debugFn = jest.spyOn(FwTracer.internalLogger, "debug").mockImplementation(() => undefined));
  afterEach(() => debugFn.mockRestore());

  test("simple", async () => {
    const tracer = FwTracer.enable({ fw });
    const consumerA = ep.consume("/A");
    consumerA.cancel();
    await expect(consumerA).rejects.toThrow();

    const producerB = ep.produce("/B", async () => new Data("/B/1", Data.FreshnessPeriod(1000)));
    await ep.consume(new Interest("/B", Interest.CanBePrefix, Interest.MustBeFresh));
    producerB.close();

    const faceC = fw.addFace(new NoopFace());
    faceC.addRoute(new Name("/C"));
    faceC.removeRoute(new Name("/C"));
    tracer.disable();
    faceC.close();

    expect(debugFn.mock.calls.map((a) => a.join(" "))).toEqual([
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
    ]);
  });
});
