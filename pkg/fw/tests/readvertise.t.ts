import "@ndn/packet/test-fixture/expect";

import { Name, type NameLike } from "@ndn/packet";
import { delay } from "@ndn/util";
import { beforeEach, expect, type Mock, test, vi } from "vitest";

import { Forwarder, type FwFace, ReadvertiseDestination } from "..";
import { NoopFace } from "../test-fixture/noop-face";

let fw: Forwarder;
beforeEach(() => {
  fw = Forwarder.create();
});

class PAObj implements FwFace.PrefixAnnouncementObj {
  constructor(name: NameLike) {
    this.announced = Name.from(name);
  }

  public readonly announced: Name;
}

class SimpleDest extends ReadvertiseDestination {
  protected override async doAdvertise(name: Name): Promise<void> {
    this.doAdv(name, Array.from(this.listAnnouncementObjs(name)));
  }

  public readonly doAdv = vi.fn< (name: Name, annObjs: readonly FwFace.PrefixAnnouncementObj[]) => void >();
  protected override doWithdraw = vi.fn<ReadvertiseDestination["doWithdraw"]>().mockResolvedValue(undefined);

  private hasEvents = false;
  private readonly annadd = vi.fn<(evt: Forwarder.AnnouncementEvent) => void>();
  private readonly annrm = vi.fn<(evt: Forwarder.AnnouncementEvent) => void>();

  public attachEventHandlers(fw: Forwarder): void {
    this.hasEvents = true;
    fw.addEventListener("annadd", this.annadd);
    fw.addEventListener("annrm", this.annrm);
  }

  public getRecord(name: NameLike): ReadvertiseDestination.Record<{}> {
    name = Name.from(name);
    const record = this.table.get(name);
    expect(record).toBeDefined();
    return record!;
  }

  public restartAdvertising(name: NameLike): void {
    name = Name.from(name);
    const record = this.getRecord(name);
    record.status = ReadvertiseDestination.Status.ADVERTISING;
    this.restart(name, record);
  }

  public expectAdvertise(names: readonly NameLike[]): void {
    SimpleDest.check(this.doAdv, this.hasEvents && this.annadd, names);
  }

  public expectWithdraw(names: readonly NameLike[]): void {
    SimpleDest.check(this.doWithdraw, this.hasEvents && this.annrm, names);
  }

  private static check(
      doFn: Mock<ReadvertiseDestination["doAdvertise"] & ReadvertiseDestination["doWithdraw"]>,
      onFn: false | Mock<(evt: Forwarder.AnnouncementEvent) => void>,
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

test("PrefixAnnouncementObj", async () => {
  const paA0 = new PAObj("/A");
  const paA1 = new PAObj("/A");

  const dest = new SimpleDest();
  dest.enable(fw);

  const faceA = fw.addFace(new NoopFace());
  faceA.addAnnouncement(paA0);
  faceA.addRoute("/A");
  await delay(5); // nameFaceAnns=[paA0, undefined]
  expect(dest.doAdv.mock.calls[0]?.[1]).toEqual([paA0]);
  dest.expectAdvertise(["/A"]);

  faceA.removeRoute("/A");
  dest.restartAdvertising("/A");
  await delay(5); // nameFaceAnns=[paA0]
  expect(dest.doAdv.mock.calls[0]?.[1]).toEqual([paA0]);
  dest.expectAdvertise(["/A"]);

  faceA.addRoute("/A/a", paA1);
  faceA.removeAnnouncement(paA0);
  dest.restartAdvertising("/A");
  await delay(5); // nameFaceAnns=[paA1]
  expect(dest.doAdv.mock.calls[0]?.[1]).toEqual([paA1]);
  dest.expectAdvertise(["/A"]);

  faceA.addAnnouncement(paA1);
  dest.restartAdvertising("/A");
  await delay(5); // nameFaceAnns=[paA1, paA1]
  expect(dest.doAdv.mock.calls[0]?.[1]).toEqual([paA1, paA1]);
  dest.expectAdvertise(["/A"]);

  faceA.removeAnnouncement(paA0); // no match in nameFaceAnns
  faceA.removeRoute("/A/a", -1); // no match in nameFaceAnns
  expect(dest.getRecord("/A").status).toBe(ReadvertiseDestination.Status.WITHDRAWING);
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
