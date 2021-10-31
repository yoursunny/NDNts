import "@ndn/packet/test-fixture/expect";

import { Name } from "@ndn/packet";
import { setTimeout as delay } from "node:timers/promises";

import { Forwarder, ReadvertiseDestination } from "..";
import { NoopFace } from "../test-fixture/noop-face";

let fw: Forwarder;
beforeEach(() => {
  fw = Forwarder.create();
});

class SimpleDest extends ReadvertiseDestination {
  public override doAdvertise = jest.fn().mockResolvedValue(undefined);
  public override doWithdraw = jest.fn().mockResolvedValue(undefined);
}

test("simple", async () => {
  const annadd = jest.fn<void, [Name]>();
  fw.on("annadd", annadd);
  const annrm = jest.fn<void, [Name]>();
  fw.on("annrm", annrm);

  const dest = new SimpleDest();
  dest.enable(fw);

  const faceA = fw.addFace(new NoopFace());
  faceA.addRoute("/M");
  faceA.addRoute("/M");
  await delay(10);
  expect(dest.doAdvertise).toHaveBeenCalledTimes(1);
  expect(dest.doAdvertise.mock.calls[0][0]).toEqualName("/M");
  expect(annadd).toHaveBeenCalledTimes(1);

  const faceB = fw.addFace(new NoopFace());
  faceB.addRoute("/M");
  await delay(10);
  expect(dest.doAdvertise).toHaveBeenCalledTimes(1);
  faceB.addRoute("/N/A/1", -1);
  faceB.addRoute("/N/B/1", "/N/B");
  faceB.addRoute("/N/C/1", false);
  await delay(10);
  expect(dest.doAdvertise).toHaveBeenCalledTimes(3);
  expect(dest.doAdvertise.mock.calls[1][0]).toEqualName("/N/A");
  expect(dest.doAdvertise.mock.calls[2][0]).toEqualName("/N/B");
  expect(annadd).toHaveBeenCalledTimes(3);

  faceA.removeRoute(new Name("/M"));
  faceA.removeRoute(new Name("/M"));
  await delay(10);
  expect(dest.doWithdraw).toHaveBeenCalledTimes(0);

  faceB.removeRoute(new Name("/M"));
  await delay(10);
  expect(dest.doWithdraw).toHaveBeenCalledTimes(1);
  expect(dest.doWithdraw.mock.calls[0][0]).toEqualName("/M");
  expect(annrm).toHaveBeenCalledTimes(1);

  faceB.close();
  await delay(10);
  expect(dest.doWithdraw).toHaveBeenCalledTimes(3);
  expect(dest.doWithdraw.mock.calls[1][0]).toEqualName("/N/A");
  expect(dest.doWithdraw.mock.calls[2][0]).toEqualName("/N/B");
  expect(annrm).toHaveBeenCalledTimes(3);

  const faceC = fw.addFace(new NoopFace(), { advertiseFrom: false });
  faceC.addRoute("/Q");
  await delay(10);
  expect(dest.doAdvertise).toHaveBeenCalledTimes(3);
});

class StatefulDest extends ReadvertiseDestination<{ S: true }> {
  constructor() {
    super({
      minTimeout: 1,
      maxTimeout: 1,
    });
  }

  public override makeState = jest.fn().mockReturnValue({ S: true });

  public doAdvertise = jest.fn().mockImplementationOnce(async () => {
    await delay(90);
    throw new Error("advertise error");
  }).mockImplementation(async () => {
    await delay(90);
  });

  public doWithdraw = jest.fn().mockImplementationOnce(async () => {
    await delay(90);
    throw new Error("withdraw error");
  }).mockImplementation(async () => {
    await delay(90);
  });
}

test("disable", async () => {
  const dest = new StatefulDest();
  dest.enable(fw);

  const faceA = fw.addFace(new NoopFace());
  faceA.addAnnouncement(new Name("/M"));
  await delay(210);
  expect(dest.doAdvertise).toHaveBeenCalledTimes(2);

  dest.disable();
  await delay(210);
  expect(dest.doWithdraw).toHaveBeenCalledTimes(1);
  // no retry after closing
});

test("retry", async () => {
  const dest = new StatefulDest();
  dest.enable(fw);

  const faceA = fw.addFace(new NoopFace());
  faceA.addAnnouncement(new Name("/M"));
  await delay(60);
  expect(dest.makeState).toHaveBeenCalledTimes(1);
  expect(dest.doAdvertise).toHaveBeenCalledTimes(1);
  await delay(180);
  expect(dest.doAdvertise).toHaveBeenCalledTimes(2);

  faceA.removeAnnouncement(new Name("/M"));
  await delay(60);
  expect(dest.doWithdraw).toHaveBeenCalledTimes(1);
  await delay(180);
  expect(dest.doWithdraw).toHaveBeenCalledTimes(2);

  expect(dest.makeState).toHaveBeenCalledTimes(1);
});

test("withdraw during advertising", async () => {
  const dest = new StatefulDest();
  dest.enable(fw);

  const faceA = fw.addFace(new NoopFace());
  faceA.addAnnouncement(new Name("/M"));
  setTimeout(() => faceA.removeAnnouncement(new Name("/M")), 60);
  await delay(270);
  expect(dest.doAdvertise).toHaveBeenCalledTimes(1);
  expect(dest.doWithdraw).toHaveBeenCalledTimes(2);
});
