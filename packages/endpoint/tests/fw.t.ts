import "@ndn/packet/test-fixture/expect";

import { CancelInterest, DataResponse, Forwarder, FwFace, FwTracer, InterestToken, RejectInterest } from "@ndn/fw";
import { NoopFace } from "@ndn/fw/test-fixture/noop-face";
import { Data, Interest, Name } from "@ndn/packet";
import { getDataFullName } from "@ndn/packet/test-fixture/name";

import { Endpoint } from "..";

let ep: Endpoint;

beforeEach(() => {
  ep = new Endpoint();
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
    });

  const producerQ = ep.produce("/Q",
    async (interest) => {
      await new Promise((r) => setTimeout(r, 120));
      return new Data(interest.name);
    });

  const canceledInterest = ep.consume(new Interest("/Q/canceled"));
  setTimeout(() => canceledInterest.cancel(), 50);
  await Promise.all([
    expect(ep.consume(new Interest("/O/no-route", Interest.Lifetime(500))))
      .rejects.toThrow(),
    expect(ep.consume(new Interest("/P/exact")))
      .resolves.toBeInstanceOf(Data),
    expect(ep.consume(new Interest("/P/prefix", Interest.CanBePrefix)))
      .resolves.toBeInstanceOf(Data),
    expect(ep.consume(new Interest("/P/no-prefix", Interest.Lifetime(500))))
      .rejects.toThrow(),
    expect(ep.consume(new Interest("/P/fresh", Interest.MustBeFresh)))
      .resolves.toBeInstanceOf(Data),
    expect(ep.consume(new Interest("/P/no-fresh", Interest.MustBeFresh, Interest.Lifetime(500))))
      .rejects.toThrow(),
    expect(ep.consume(new Interest("/Q/exact")))
      .resolves.toBeInstanceOf(Data),
    expect(ep.consume(new Interest("/Q/too-slow", Interest.Lifetime(100))))
      .rejects.toThrow(),
    expect(ep.consume(new Interest(nameDigest)))
      .resolves.toBeInstanceOf(Data),
    expect(ep.consume(new Interest(nameWrongDigest, Interest.Lifetime(500))))
      .rejects.toThrow(),
    expect(canceledInterest)
      .rejects.toThrow(),
  ]);

  await new Promise((r) => setTimeout(r, 50));
  expect(ep.fw.faces.size).toBe(2);
  producerP.close();
  producerQ.close();
  expect(ep.fw.faces.size).toBe(0);
});

test("aggregate & retransmit", async () => {
  let producedP = false;
  ep.produce("/P",
    async (interest) => {
      if (producedP) {
        return false;
      }
      producedP = true;
      await new Promise((r) => setTimeout(r, 100));
      return new Data("/P/Q/R/S");
    });

  let nRxData = 0;
  let nRxRejects = 0;
  const face = ep.fw.addFace({
    extendedTx: true,
    rx: (async function*() {
      yield InterestToken.set(new Interest("/P/Q/R", Interest.CanBePrefix, Interest.Nonce(0xC91585F2)), 1);
      yield InterestToken.set(new Interest("/P", Interest.CanBePrefix), 4);
      yield InterestToken.set(new Interest("/L", Interest.Lifetime(100)), 5); // no route other than self
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
          const data = pkt as DataResponse<number>;
          const tokens = new Set(InterestToken.get(data));
          expect(tokens.has(1)).toBeFalsy();
          expect(tokens.has(2)).toBeTruthy();
          expect(tokens.has(3)).toBeTruthy();
          ++nRxData;
        } else if (pkt instanceof RejectInterest) {
          const rej = pkt as RejectInterest<number>;
          switch (InterestToken.get(rej)) {
            case 4:
              expect(rej.reason).toBe("cancel");
              break;
            case 5:
              expect(rej.reason).toBe("expire");
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
  } as FwFace.RxTxExtended);
  face.addRoute(new Name("/L"));

  await Promise.all([
    expect(ep.consume(new Interest("/P/Q", Interest.CanBePrefix)))
      .resolves.toBeInstanceOf(Data),
    expect(ep.consume(new Interest("/P/Q", Interest.CanBePrefix)))
      .resolves.toBeInstanceOf(Data),
    expect(ep.consume(new Interest("/P/Q/R/S")))
      .resolves.toBeInstanceOf(Data),
  ]);

  expect(nRxData).toBe(1);
  expect(nRxRejects).toBe(2);
});

describe("tracer", () => {
  let debugFn: jest.SpyInstance;
  beforeEach(() => debugFn = jest.spyOn(FwTracer.internalLogger, "debug").mockImplementation(() => undefined));
  afterEach(() => debugFn.mockRestore());

  test("simple", async () => {
    const tracer = FwTracer.enable();
    const consumerA = ep.consume(new Interest("/A"));
    consumerA.cancel();
    await expect(consumerA).rejects.toThrow();

    const produerB = ep.produce("/B", async () => new Data("/B/1", Data.FreshnessPeriod(1000)));
    await ep.consume(new Interest("/B", Interest.CanBePrefix, Interest.MustBeFresh));
    produerB.close();

    const faceC = Forwarder.getDefault().addFace(new NoopFace());
    faceC.addRoute(new Name("/C"));
    faceC.removeRoute(new Name("/C"));
    tracer.disable();
    faceC.close();

    expect(debugFn.mock.calls.map((a) => a.join(" "))).toEqual([
      "+Face consume(/A)",
      "consume(/A) >I /A",
      "consume(/A) >Cancel /A",
      "consume(/A) <Reject(cancel) /A",
      "+Face produce(/B)",
      "produce(/B) +Prefix /B",
      "+Announcement /B",
      "+Face consume(/B)",
      "consume(/B) >I /B[P][F]",
      "-Face consume(/A)",
      "produce(/B) <I /B[P][F]",
      "produce(/B) >D /B/1",
      "consume(/B) <D /B/1",
      "-Announcement /B",
      "-Face produce(/B)",
      "+Face NoopFace",
      "NoopFace +Prefix /C",
      "+Announcement /C",
      "-Announcement /C",
      "NoopFace -Prefix /C",
    ]);
  });
});
