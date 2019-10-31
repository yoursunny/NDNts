import { Data, Interest } from "@ndn/l3pkt";
import { Name } from "@ndn/name";

import { Forwarder, FwTracer, SimpleEndpoint } from "../src";
import { logger } from "../src/tracer";
import { NoopFace } from "../test-fixture/noop-face";

let debugFn: jest.SpyInstance;

beforeEach(() => {
  debugFn = jest.spyOn(logger, "debug").mockImplementation(() => undefined);
});

afterEach(() => {
  debugFn.mockRestore();
  Forwarder.deleteDefault();
});

test("simple", async () => {
  const tracer = FwTracer.enable();
  const se = new SimpleEndpoint();

  const consumerA = se.consume(new Interest("/A"));
  consumerA.abort();
  await expect(consumerA).rejects.toThrow();

  const produerB = se.produce({
    prefix: new Name("/B"),
    async handler() { return new Data("/B/1", Data.FreshnessPeriod(1000)); },
  });
  await se.consume(new Interest("/B", Interest.CanBePrefix, Interest.MustBeFresh));
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
