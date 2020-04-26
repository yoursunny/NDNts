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
  appB.addRoute(new Name("/N/A/1"), -1);
  appB.addRoute(new Name("/N/B/1"), new Name("/N/B"));
  appB.addRoute(new Name("/N/C/1"), false);
  expect(advertiseP.doAdvertise).toHaveBeenCalledTimes(3);
  expect(advertiseP.doAdvertise.mock.calls[1][0]).toEqualName("/N/A");
  expect(advertiseP.doAdvertise.mock.calls[2][0]).toEqualName("/N/B");
  expect(annadd).toHaveBeenCalledTimes(3);

  appA.removeRoute(new Name("/M"));
  appA.removeRoute(new Name("/M"));
  expect(advertiseP.doWithdraw).toHaveBeenCalledTimes(0);

  appB.removeRoute(new Name("/M"));
  expect(advertiseP.doWithdraw).toHaveBeenCalledTimes(1);
  expect(advertiseP.doWithdraw.mock.calls[0][0]).toEqualName("/M");
  expect(annrm).toHaveBeenCalledTimes(1);

  appB.close();
  expect(advertiseP.doWithdraw).toHaveBeenCalledTimes(3);
  expect(advertiseP.doWithdraw.mock.calls[1][0]).toEqualName("/N/A");
  expect(advertiseP.doWithdraw.mock.calls[2][0]).toEqualName("/N/B");
  expect(annrm).toHaveBeenCalledTimes(3);

  uplinkQ.addRoute(new Name("/Q"));
  expect(advertiseP.doAdvertise).toHaveBeenCalledTimes(3);
});
