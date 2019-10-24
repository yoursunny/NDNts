import { Name } from "@ndn/name";
import "@ndn/name/test-fixture";

import { Advertise, Forwarder } from "../src";
import { NoopFace } from "../test-fixture/noop-face";

class MockAdvertise extends Advertise {
  public doAdvertise = jest.fn().mockReturnValue(Promise.resolve());
  public doWithdraw = jest.fn().mockReturnValue(Promise.resolve());
}

test("simple", async () => {
  const fw = Forwarder.create();

  const uplinkP = fw.addFace(new NoopFace());
  const advertiseP = new MockAdvertise(uplinkP);
  uplinkP.advertise = advertiseP;

  const appA = fw.addFace(new NoopFace());
  appA.addRoute(new Name("/M"));
  appA.addRoute(new Name("/M"));
  expect(advertiseP.doAdvertise).toHaveBeenCalledTimes(1);
  expect(advertiseP.doAdvertise.mock.calls[0][0]).toEqualName("/M");

  const appB = fw.addFace(new NoopFace());
  appB.addRoute(new Name("/M"));
  expect(advertiseP.doAdvertise).toHaveBeenCalledTimes(1);

  appA.removeRoute(new Name("/M"));
  appA.removeRoute(new Name("/M"));
  expect(advertiseP.doWithdraw).toHaveBeenCalledTimes(0);

  appB.removeRoute(new Name("/M"));
  expect(advertiseP.doWithdraw).toHaveBeenCalledTimes(1);
  expect(advertiseP.doWithdraw.mock.calls[0][0]).toEqualName("/M");
});
