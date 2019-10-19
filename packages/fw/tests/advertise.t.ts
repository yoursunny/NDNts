import { Name } from "@ndn/name";
import "@ndn/name/test-fixture";

import { Advertise, Forwarder } from "../src";

class MockAdvertise extends Advertise {
  public doAdvertise = jest.fn().mockReturnValue(Promise.resolve());
  public doWithdraw = jest.fn().mockReturnValue(Promise.resolve());
}

test("simple", async () => {
  const fw = Forwarder.create();

  // tslint:disable-next-line:no-empty
  const uplinkP = fw.addFace(async function*() {});
  const advertiseP = new MockAdvertise(uplinkP);
  uplinkP.advertise = advertiseP;

  // tslint:disable-next-line:no-empty
  const appA = fw.addFace(async function*() {});
  appA.addRoute(new Name("/M"));
  appA.addRoute(new Name("/M"));
  expect(advertiseP.doAdvertise).toHaveBeenCalledTimes(1);
  expect(advertiseP.doAdvertise.mock.calls[0][0]).toEqualName("/M");

  // tslint:disable-next-line:no-empty
  const appB = fw.addFace(async function*() {});
  appB.addRoute(new Name("/M"));
  expect(advertiseP.doAdvertise).toHaveBeenCalledTimes(1);

  appA.removeRoute(new Name("/M"));
  appA.removeRoute(new Name("/M"));
  expect(advertiseP.doWithdraw).toHaveBeenCalledTimes(0);

  appB.removeRoute(new Name("/M"));
  expect(advertiseP.doWithdraw).toHaveBeenCalledTimes(1);
  expect(advertiseP.doWithdraw.mock.calls[0][0]).toEqualName("/M");
});
