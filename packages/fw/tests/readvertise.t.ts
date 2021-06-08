import "@ndn/packet/test-fixture/expect";

import { Name } from "@ndn/packet";

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
  faceA.addRoute(new Name("/M"));
  faceA.addRoute(new Name("/M"));
  await new Promise((r) => setTimeout(r, 10));
  expect(dest.doAdvertise).toHaveBeenCalledTimes(1);
  expect(dest.doAdvertise.mock.calls[0][0]).toEqualName("/M");
  expect(annadd).toHaveBeenCalledTimes(1);

  const faceB = fw.addFace(new NoopFace());
  faceB.addRoute(new Name("/M"));
  await new Promise((r) => setTimeout(r, 10));
  expect(dest.doAdvertise).toHaveBeenCalledTimes(1);
  faceB.addRoute(new Name("/N/A/1"), -1);
  faceB.addRoute(new Name("/N/B/1"), new Name("/N/B"));
  faceB.addRoute(new Name("/N/C/1"), false);
  await new Promise((r) => setTimeout(r, 10));
  expect(dest.doAdvertise).toHaveBeenCalledTimes(3);
  expect(dest.doAdvertise.mock.calls[1][0]).toEqualName("/N/A");
  expect(dest.doAdvertise.mock.calls[2][0]).toEqualName("/N/B");
  expect(annadd).toHaveBeenCalledTimes(3);

  faceA.removeRoute(new Name("/M"));
  faceA.removeRoute(new Name("/M"));
  await new Promise((r) => setTimeout(r, 10));
  expect(dest.doWithdraw).toHaveBeenCalledTimes(0);

  faceB.removeRoute(new Name("/M"));
  await new Promise((r) => setTimeout(r, 10));
  expect(dest.doWithdraw).toHaveBeenCalledTimes(1);
  expect(dest.doWithdraw.mock.calls[0][0]).toEqualName("/M");
  expect(annrm).toHaveBeenCalledTimes(1);

  faceB.close();
  await new Promise((r) => setTimeout(r, 10));
  expect(dest.doWithdraw).toHaveBeenCalledTimes(3);
  expect(dest.doWithdraw.mock.calls[1][0]).toEqualName("/N/A");
  expect(dest.doWithdraw.mock.calls[2][0]).toEqualName("/N/B");
  expect(annrm).toHaveBeenCalledTimes(3);

  const faceC = fw.addFace(new NoopFace(), { advertiseFrom: false });
  faceC.addRoute(new Name("/Q"));
  await new Promise((r) => setTimeout(r, 10));
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
    await new Promise((r) => setTimeout(r, 90));
    throw new Error("advertise error");
  }).mockImplementation(async () => {
    await new Promise((r) => setTimeout(r, 90));
  });

  public doWithdraw = jest.fn().mockImplementationOnce(async () => {
    await new Promise((r) => setTimeout(r, 90));
    throw new Error("withdraw error");
  }).mockImplementation(async () => {
    await new Promise((r) => setTimeout(r, 90));
  });
}

test("disable", async () => {
  const dest = new StatefulDest();
  dest.enable(fw);

  const faceA = fw.addFace(new NoopFace());
  faceA.addAnnouncement(new Name("/M"));
  await new Promise((r) => setTimeout(r, 210));
  expect(dest.doAdvertise).toHaveBeenCalledTimes(2);

  dest.disable();
  await new Promise((r) => setTimeout(r, 210));
  expect(dest.doWithdraw).toHaveBeenCalledTimes(1);
  // no retry after closing
});

test("retry", async () => {
  const dest = new StatefulDest();
  dest.enable(fw);

  const faceA = fw.addFace(new NoopFace());
  faceA.addAnnouncement(new Name("/M"));
  await new Promise((r) => setTimeout(r, 60));
  expect(dest.makeState).toHaveBeenCalledTimes(1);
  expect(dest.doAdvertise).toHaveBeenCalledTimes(1);
  await new Promise((r) => setTimeout(r, 180));
  expect(dest.doAdvertise).toHaveBeenCalledTimes(2);

  faceA.removeAnnouncement(new Name("/M"));
  await new Promise((r) => setTimeout(r, 60));
  expect(dest.doWithdraw).toHaveBeenCalledTimes(1);
  await new Promise((r) => setTimeout(r, 180));
  expect(dest.doWithdraw).toHaveBeenCalledTimes(2);

  expect(dest.makeState).toHaveBeenCalledTimes(1);
});

test("withdraw during advertising", async () => {
  const dest = new StatefulDest();
  dest.enable(fw);

  const faceA = fw.addFace(new NoopFace());
  faceA.addAnnouncement(new Name("/M"));
  setTimeout(() => faceA.removeAnnouncement(new Name("/M")), 60);
  await new Promise((r) => setTimeout(r, 270));
  expect(dest.doAdvertise).toHaveBeenCalledTimes(1);
  expect(dest.doWithdraw).toHaveBeenCalledTimes(2);
});
