import "@ndn/packet/test-fixture/expect";

import { type NameLike, Name } from "@ndn/packet";
import { delay } from "@ndn/util";
import { type SpyInstanceFn, beforeEach, expect, test, vi } from "vitest";

import { Forwarder, ReadvertiseDestination } from "..";
import { NoopFace } from "../test-fixture/noop-face";

let fw: Forwarder;
beforeEach(() => {
  fw = Forwarder.create();
});

class SimpleDest extends ReadvertiseDestination {
  public override doAdvertise = vi.fn<[Name, {}], Promise<void>>().mockResolvedValue(undefined);
  public override doWithdraw = vi.fn<[Name, {}], Promise<void>>().mockResolvedValue(undefined);

  public readonly annadd = vi.fn<[Name], void>();
  public readonly annrm = vi.fn<[Name], void>();

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
      doFn: SpyInstanceFn<[Name, {}], Promise<void>>,
      onFn: SpyInstanceFn<[Name], void>,
      names: NameLike[],
  ) {
    expect(doFn).toHaveBeenCalledTimes(names.length);
    expect(onFn).toHaveBeenCalledTimes(names.length);
    for (const [i, nameLike] of names.entries()) {
      const name = Name.from(nameLike);
      expect(doFn.mock.calls[i]![0]).toEqualName(name);
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
