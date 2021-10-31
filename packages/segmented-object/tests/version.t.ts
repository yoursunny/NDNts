import "@ndn/packet/test-fixture/expect";

import { Endpoint } from "@ndn/endpoint";
import { Forwarder } from "@ndn/fw";
import { Closers } from "@ndn/l3face/test-fixture/closers";
import { Segment as Segment1, Version as Version1 } from "@ndn/naming-convention1";
import { Segment as Segment2, Version as Version2 } from "@ndn/naming-convention2";
import { Data, Interest, Name } from "@ndn/packet";

import { BufferChunkSource, ChunkSource, discoverVersion, serve, serveVersioned } from "..";

const closers = new Closers();

afterEach(() => {
  Forwarder.deleteDefault();
  closers.close();
});

describe("serve", () => {
  let source: ChunkSource;
  beforeEach(() => source = new BufferChunkSource(new Uint8Array()));

  test("version from number", async () => {
    const server = serveVersioned("/A", source, { version: 65 });
    closers.push(server);

    const versioned = await discoverVersion(new Name("/A"));
    expect(versioned).toHaveLength(2);
    expect(versioned.at(-1)).toEqualComponent(Version2.create(65));

    // missing CanBePrefix
    await expect(new Endpoint().consume(new Interest("/A", Interest.MustBeFresh, Interest.Lifetime(50))))
      .rejects.toThrow();
  });

  test("version from timestamp", async () => {
    const server = serveVersioned("/A", source);
    closers.push(server);

    const versioned = await discoverVersion(new Name("/A"));
    expect(versioned).toHaveLength(2);
    const versionComp = versioned.at(-1);
    expect(Version2.match(versionComp)).toBeTruthy();
    expect(Math.abs(Date.now() - Version2.parse(versionComp))).toBeLessThan(5000);
  });

  test("custom version component", async () => {
    const server = serveVersioned("/A", source,
      { version: Version1.create(77), segmentNumConvention: Segment1 });
    closers.push(server);

    const versioned = await discoverVersion(new Name("/A"),
      { versionConvention: Version1, segmentNumConvention: Segment1 });
    expect(versioned).toHaveLength(2);
    expect(versioned.at(-1)).toEqualComponent(Version1.create(77));

    const versioned1 = await discoverVersion(new Name("/A"),
      { conventions: [[Version2, Segment2], [Version1, Segment2], [Version1, Segment1]] });
    expect(versioned1).toEqualName(versioned);
    expect(versioned1.versionConvention).toBe(Version1);
    expect(versioned1.segmentNumConvention).toBe(Segment1);
  });

  test("no version", async () => {
    const server = serve("/A", source);
    closers.push(server);

    await expect(new Endpoint().consume(new Interest("/A", Interest.CanBePrefix, Interest.MustBeFresh)))
      .resolves.toHaveName(new Name("/A").append(Segment2, 0));
    await expect(discoverVersion(new Name("/A"))).rejects.toThrow();
  });
});

test("discover simple", async () => {
  const producer = new Endpoint().produce("/A",
    async (interest) => {
      expect(interest.name).toEqualName("/A");
      expect(interest.canBePrefix).toBeTruthy();
      expect(interest.mustBeFresh).toBeTruthy();
      const name = interest.name.append(Version2, 2).append(Segment2, 4);
      return new Data(name, Data.FreshnessPeriod(1000));
    });
  closers.push(producer);

  await expect(discoverVersion(new Name("/A")))
    .resolves.toEqualName(new Name("/A").append(Version2, 2));
});

test.each([3, discoverVersion.ANY_SUFFIX_LEN] as Array<discoverVersion.Options["expectedSuffixLen"]>,
)("discover expectedSuffixLen", async (expectedSuffixLen) => {
  const producer = new Endpoint().produce("/A",
    async () => {
      const name = new Name("/A/S").append(Version2, 2).append(Segment2, 4);
      return new Data(name, Data.FreshnessPeriod(1000));
    });
  closers.push(producer);

  await expect(discoverVersion(new Name("/A"), { expectedSuffixLen }))
    .resolves.toEqualName(new Name("/A/S").append(Version2, 2));
});

const wrongNames = [
  new Name("/A/B/C/D"),
  new Name("/A/B/C"),
  new Name("/A/B").append(Segment2, 4),
  new Name("/A").append(Version2, 2).append("C"),
];

test.each(wrongNames)("discover wrong name %#", async (dataName) => {
  const producer = new Endpoint().produce("/A",
    async () => new Data(dataName, Data.FreshnessPeriod(1000)));
  closers.push(producer);

  await expect(discoverVersion(new Name("/A"))).rejects.toThrow(/cannot extract version/);
});

test("discover cancel", async () => {
  const abort = new AbortController();
  const p = discoverVersion(new Name("/A"), { signal: abort.signal });
  setTimeout(() => abort.abort(), 100);
  await expect(p).rejects.toThrow();
});
