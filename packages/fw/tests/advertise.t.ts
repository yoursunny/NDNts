import "@ndn/packet/test-fixture/expect";

import { Name } from "@ndn/packet";

import { Advertise, Forwarder } from "..";
import { NoopFace } from "../test-fixture/noop-face";

class MockAdvertise extends Advertise {
  public doAdvertise = jest.fn().mockResolvedValue(undefined);
  public doWithdraw = jest.fn().mockResolvedValue(undefined);
}

test("simple", async () => {
  const fw = Forwarder.create();

  const annadd = jest.fn<void, [Name]>();
  fw.on("annadd", annadd);
  const annrm = jest.fn<void, [Name]>();
  fw.on("annrm", annrm);

  const uplinkP = fw.addFace(new NoopFace(), { advertiseFrom: false });
  const advertiseP = new MockAdvertise(uplinkP);
  uplinkP.advertise = advertiseP;

  const uplinkQ = fw.addFace(new NoopFace(), { advertiseFrom: false });

  const appA = fw.addFace(new NoopFace());
  appA.addRoute(new Name("/M"));
  appA.addRoute(new Name("/M"));
  expect(advertiseP.doAdvertise).toHaveBeenCalledTimes(1);
  expect(advertiseP.doAdvertise.mock.calls[0][0]).toEqualName("/M");
  expect(annadd).toHaveBeenCalledTimes(1);

  const appB = fw.addFace(new NoopFace());
  appB.addRoute(new Name("/M"));
  expect(advertiseP.doAdvertise).toHaveBeenCalledTimes(1);

  appA.removeRoute(new Name("/M"));
  appA.removeRoute(new Name("/M"));
  expect(advertiseP.doWithdraw).toHaveBeenCalledTimes(0);

  appB.removeRoute(new Name("/M"));
  expect(advertiseP.doWithdraw).toHaveBeenCalledTimes(1);
  expect(advertiseP.doWithdraw.mock.calls[0][0]).toEqualName("/M");
  expect(annrm).toHaveBeenCalledTimes(1);

  uplinkQ.addRoute(new Name("/Q"));
  expect(advertiseP.doAdvertise).toHaveBeenCalledTimes(1);
});
