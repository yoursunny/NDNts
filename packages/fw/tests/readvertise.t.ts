import "@ndn/packet/test-fixture/expect";

import { type NameLike, Name } from "@ndn/packet";
import { toHex } from "@ndn/util";
import { setTimeout as delay } from "node:timers/promises";

import { Forwarder, ReadvertiseDestination } from "..";
import { NoopFace } from "../test-fixture/noop-face";

let fw: Forwarder;
beforeEach(() => {
  fw = Forwarder.create();
});

class SimpleDest extends ReadvertiseDestination {
  public override doAdvertise = jest.fn<Promise<void>, [Name, {}, string]>().mockResolvedValue(undefined);
  public override doWithdraw = jest.fn<Promise<void>, [Name, {}, string]>().mockResolvedValue(undefined);

  public readonly annadd = jest.fn<void, [Name]>();
  public readonly annrm = jest.fn<void, [Name]>();

  public attachEventHandlers(fw: Forwarder): void {
    fw.on("annadd", this.annadd);
    fw.on("annrm", this.annrm);
  }

  public expectAdvertise(names: NameLike[]): void {
    SimpleDest.check(this.doAdvertise, this.annadd, names);
  }

  public expectWithdraw(names: NameLike[]): void {
    SimpleDest.check(this.doWithdraw, this.annrm, names);
  }

  private static check(
      doFn: jest.Mock<Promise<void>, [Name, {}, string]>,
      onFn: jest.Mock<void, [Name]>,
      names: NameLike[],
  ) {
    expect(doFn).toHaveBeenCalledTimes(names.length);
    expect(onFn).toHaveBeenCalledTimes(names.length);
    for (const [i, nameLike] of names.entries()) {
      const name = new Name(nameLike);
      expect(doFn.mock.calls[i]![0]).toEqualName(name);
      expect(doFn.mock.calls[i]![2]).toBe(toHex(name.value));
      expect(onFn.mock.calls[i]![0]).toEqualName(name);
    }
    doFn.mockClear();
    onFn.mockClear();
  }
}

test("simple", async () => {
  const dest = new SimpleDest();
  dest.enable(fw);
  dest.attachEventHandlers(fw);

  const faceA = fw.addFace(new NoopFace());
  faceA.addRoute("/M");
  faceA.addRoute("/M");
  await delay(5);
  dest.expectAdvertise(["/M"]);

  const faceB = fw.addFace(new NoopFace());
  faceB.addRoute("/M");
  await delay(5);
  dest.expectAdvertise([]);
  faceB.addRoute("/N/A/1", -1);
  faceB.addRoute("/N/B/1", "/N/B");
  faceB.addRoute("/N/C/1", false);
  await delay(5);
  dest.expectAdvertise(["/N/A", "/N/B"]);

  faceA.removeRoute("/M");
  faceA.removeRoute("/M");
  await delay(5);
  dest.expectWithdraw([]);

  faceB.removeRoute("/M");
  await delay(5);
  dest.expectWithdraw(["/M"]);

  faceB.removeRoute("/N/B/1", "/N/B");
  await delay(5);
  dest.expectWithdraw(["/N/B"]);

  faceB.close();
  await delay(5);
  dest.expectWithdraw(["/N/A"]);

  const faceC = fw.addFace(new NoopFace(), { advertiseFrom: false });
  faceC.addRoute("/Q");
  await delay(5);
  dest.expectAdvertise([]);
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
