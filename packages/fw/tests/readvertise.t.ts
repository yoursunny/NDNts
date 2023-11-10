import "@ndn/packet/test-fixture/expect";

import { type Name, type NameLike } from "@ndn/packet";
import { delay } from "@ndn/util";
import { beforeEach, expect, type Mock, test, vi } from "vitest";

import { Forwarder, ReadvertiseDestination } from "..";
import { NoopFace } from "../test-fixture/noop-face";

let fw: Forwarder;
beforeEach(() => {
  fw = Forwarder.create();
});

class SimpleDest extends ReadvertiseDestination {
  protected override doAdvertise = vi.fn<[Name, {}], Promise<void>>().mockResolvedValue(undefined);
  protected override doWithdraw = vi.fn<[Name, {}], Promise<void>>().mockResolvedValue(undefined);

  private hasEvents = false;
  private readonly annadd = vi.fn<[Forwarder.AnnouncementEvent], void>();
  private readonly annrm = vi.fn<[Forwarder.AnnouncementEvent], void>();

  public attachEventHandlers(fw: Forwarder): void {
    this.hasEvents = true;
    fw.addEventListener("annadd", this.annadd);
    fw.addEventListener("annrm", this.annrm);
  }

  public expectAdvertise(names: readonly NameLike[]): void {
    SimpleDest.check(this.doAdvertise, this.hasEvents && this.annadd, names);
  }

  public expectWithdraw(names: readonly NameLike[]): void {
    SimpleDest.check(this.doWithdraw, this.hasEvents && this.annrm, names);
  }

  private static check(
      doFn: Mock<[Name, {}], Promise<void>>,
      onFn: false | Mock<[Forwarder.AnnouncementEvent], void>,
      names: readonly NameLike[],
  ) {
    expect(doFn).toHaveBeenCalledTimes(names.length);
    if (onFn) {
      expect(onFn).toHaveBeenCalledTimes(names.length);
    }

    for (const [i, nameLike] of names.entries()) {
      expect(doFn.mock.calls[i]![0]).toEqualName(nameLike);
      if (onFn) {
        expect(onFn.mock.calls[i]![0].name).toEqualName(nameLike);
      }
    }

    doFn.mockClear();
    if (onFn) {
      onFn.mockClear();
    }
  }
}

class StatefulDest extends ReadvertiseDestination<{ S: true }> {
  constructor() {
    super({
      minTimeout: 1,
      maxTimeout: 1,
    });
  }

  public override makeState = vi.fn().mockReturnValue({ S: true });

  public doAdvertise = vi.fn().mockImplementationOnce(async () => {
    await delay(90);
    throw new Error("advertise error");
  }).mockImplementation(async () => {
    await delay(90);
  });

  public doWithdraw = vi.fn().mockImplementationOnce(async () => {
    await delay(90);
    throw new Error("withdraw error");
  }).mockImplementation(async () => {
    await delay(90);
  });
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

test("disable", async () => {
  const dest = new StatefulDest();
  dest.enable(fw);

  const faceA = fw.addFace(new NoopFace());
  faceA.addAnnouncement("/M");
  await delay(210);
  expect(dest.doAdvertise).toHaveBeenCalledTimes(2);

  dest.disable();
  await delay(210);
  expect(dest.doWithdraw).toHaveBeenCalledTimes(1);
  // no retry after closing
});

test("new dest", async () => {
  const dest0 = new SimpleDest();
  dest0.enable(fw);

  const faceA = fw.addFace(new NoopFace());
  faceA.addAnnouncement("/A");
  await delay(5);
  dest0.expectAdvertise(["/A"]);

  const dest1 = new SimpleDest();
  dest1.enable(fw);
  await delay(5);
  dest1.expectAdvertise(["/A"]);
});

test("retry", async () => {
  const dest = new StatefulDest();
  dest.enable(fw);

  const faceA = fw.addFace(new NoopFace());
  faceA.addAnnouncement("/M");
  await delay(60);
  expect(dest.makeState).toHaveBeenCalledTimes(1);
  expect(dest.doAdvertise).toHaveBeenCalledTimes(1);
  await delay(180);
  expect(dest.doAdvertise).toHaveBeenCalledTimes(2);

  faceA.removeAnnouncement("/M");
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
  faceA.addAnnouncement("/M");
  setTimeout(() => faceA.removeAnnouncement("/M"), 60);
  await delay(270);
  expect(dest.doAdvertise).toHaveBeenCalledTimes(1);
  expect(dest.doWithdraw).toHaveBeenCalledTimes(2);
});
