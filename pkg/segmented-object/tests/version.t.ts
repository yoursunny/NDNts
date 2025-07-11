import "@ndn/packet/test-fixture/expect";

import { consume, produce } from "@ndn/endpoint";
import { Forwarder } from "@ndn/fw";
import { Segment2, Segment3, Version2, Version3 } from "@ndn/naming-convention2";
import { Data, Interest, Name } from "@ndn/packet";
import { Closers } from "@ndn/util";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { BufferChunkSource, type ChunkSource, discoverVersion, serve, serveVersioned } from "..";

const closers = new Closers();

afterEach(() => {
  Forwarder.deleteDefault();
  closers.close();
});

describe("serve", () => {
  let source: ChunkSource;
  beforeEach(() => { source = new BufferChunkSource(new Uint8Array()); });

  test("version from number", async () => {
    const server = serveVersioned("/A", source, { version: 65 });
    closers.push(server);

    const versioned = await discoverVersion(new Name("/A"));
    expect(versioned).toHaveLength(2);
    expect(versioned.at(-1)).toEqualComponent(Version3.create(65));

    // missing CanBePrefix
    await expect(consume(new Interest("/A", Interest.MustBeFresh, Interest.Lifetime(50))))
      .rejects.toThrow();
  });

  test("version from timestamp", async () => {
    const server = serveVersioned("/A", source);
    closers.push(server);

    const versioned = await discoverVersion(new Name("/A"));
    expect(versioned).toHaveLength(2);
    const versionComp = versioned.at(-1);
    expect(Version3.match(versionComp)).toBeTruthy();
    expect(Math.abs(Date.now() - Version3.parse(versionComp))).toBeLessThan(5000);
  });

  test("custom version component", async () => {
    const server = serveVersioned(
      "/A", source,
      { version: Version2.create(77), segmentNumConvention: Segment2 },
    );
    closers.push(server);

    const versioned = await discoverVersion(
      new Name("/A"),
      { versionConvention: Version2, segmentNumConvention: Segment2 },
    );
    expect(versioned).toHaveLength(2);
    expect(versioned.at(-1)).toEqualComponent(Version2.create(77));

    const versioned1 = await discoverVersion(
      new Name("/A"),
      { conventions: [[Version3, Segment3], [Version2, Segment3], [Version2, Segment2]] },
    );
    expect(versioned1).toEqualName(versioned);
    expect(versioned1.versionConvention).toBe(Version2);
    expect(versioned1.segmentNumConvention).toBe(Segment2);
  });

  test("no version", async () => {
    const server = serve("/A", source);
    closers.push(server);

    await expect(consume(new Interest("/A", Interest.CanBePrefix, Interest.MustBeFresh)))
      .resolves.toHaveName(new Name("/A").append(Segment3, 0));
    await expect(discoverVersion(new Name("/A"))).rejects.toThrow();
  });
});

test("discover simple", async () => {
  const producer = produce(
    "/A",
    async (interest) => {
      expect(interest.name).toEqualName("/A");
      expect(interest.canBePrefix).toBeTruthy();
      expect(interest.mustBeFresh).toBeTruthy();
      const name = interest.name.append(Version3, 2).append(Segment3, 4);
      return new Data(name, Data.FreshnessPeriod(1000));
    },
  );
  closers.push(producer);

  await expect(discoverVersion(new Name("/A")))
    .resolves.toEqualName(new Name("/A").append(Version3, 2));
});

test.each<[discoverVersion.Options["expectedSuffixLen"], string, boolean]>([
  [3, "/S", true],
  [3, "/S/S", false],
  [[5, 7, 3], "/S", true],
  [[5, 7, 3], "/S/S", false],
  [[5, 7, 3], "/S/S/S", true],
  [discoverVersion.ANY_SUFFIX_LEN, "/S", true],
  [discoverVersion.ANY_SUFFIX_LEN, "/S/S", true],
])("discover expectedSuffixLen %#", async (expectedSuffixLen, nameMid, ok) => {
  const versioned = new Name(`/A${nameMid}`).append(Version3, 2);
  const producer = produce(
    "/A",
    async () => new Data(versioned.append(Segment3, 4), Data.FreshnessPeriod(1000)),
  );
  closers.push(producer);

  const promise = discoverVersion(new Name("/A"), { expectedSuffixLen });
  if (ok) {
    await expect(promise).resolves.toEqualName(versioned);
  } else {
    await expect(promise).rejects.toThrow(/cannot extract version/);
  }
});

const wrongNames = [
  new Name("/A/B/C/D"),
  new Name("/A/B/C"),
  new Name("/A/B").append(Segment3, 4),
  new Name("/A").append(Version3, 2).append("C"),
];

test.each(wrongNames)("discover wrong name %#", async (dataName) => {
  const producer = produce(
    "/A",
    async () => new Data(dataName, Data.FreshnessPeriod(1000)),
  );
  closers.push(producer);

  await expect(discoverVersion(new Name("/A"))).rejects.toThrow(/cannot extract version/);
});

test("discover cancel", async () => {
  const p = discoverVersion(new Name("/A"), { signal: AbortSignal.timeout(100) });
  await expect(p).rejects.toThrow();
});
