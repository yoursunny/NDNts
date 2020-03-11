import { Endpoint } from "@ndn/endpoint";
import { Forwarder } from "@ndn/fw";
import { Segment as Segment1, Version as Version1 } from "@ndn/naming-convention1";
import { Segment as Segment2, Version as Version2 } from "@ndn/naming-convention2";
import { Data, Interest, Name } from "@ndn/packet";
import "@ndn/packet/test-fixture/expect";

import { discoverVersion, serve } from "..";

afterEach(() => Forwarder.deleteDefault());

describe("serve", () => {
  let server: serve.Server;
  afterEach(() => server.stop());

  test("version from number", async () => {
    server = serve(new Name("/A"), new Uint8Array(), { version: 65 });
    const versioned = await discoverVersion(new Name("/A"));
    expect(versioned).toHaveLength(2);
    expect(versioned.at(-1)).toEqualComponent(Version2.create(65));
  });

  test("version from timestamp", async () => {
    server = serve(new Name("/A"), new Uint8Array(), { version: true });
    const versioned = await discoverVersion(new Name("/A"));
    expect(versioned).toHaveLength(2);
    const versionComp = versioned.at(-1);
    expect(Version2.match(versionComp)).toBeTruthy();
    expect(Math.abs(Date.now() - Version2.parse(versionComp))).toBeLessThan(5000);
  });

  test("custom version component", async () => {
    server = serve(new Name("/A"), new Uint8Array(),
      { version: Version1.create(77), segmentNumConvention: Segment1 });
    const versioned = await discoverVersion(new Name("/A"),
      { versionConvention: Version1, segmentNumConvention: Segment1 });
    expect(versioned).toHaveLength(2);
    expect(versioned.at(-1)).toEqualComponent(Version1.create(77));
  });

  test("no version", async () => {
    server = serve(new Name("/A"), new Uint8Array());
    await expect(new Endpoint().consume(new Interest("/A", Interest.CanBePrefix, Interest.MustBeFresh)))
      .resolves.toHaveName(new Name("/A").append(Segment2, 0));
    await expect(discoverVersion(new Name("/A"))).rejects.toThrow();
  });
});

test.each([false, true])("discover mbf=%p", async (mbf) => {
  const producer = new Endpoint().produce("/A",
    async (interest) => {
      expect(interest.name).toEqualName("/A");
      expect(interest.canBePrefix).toBeTruthy();
      expect(interest.mustBeFresh).toBe(mbf);
      const data = new Data(interest.name.append(Version2, 2).append(Segment2, 4));
      if (mbf) {
        data.freshnessPeriod = 1000;
      }
      return data;
    });
  await expect(discoverVersion(new Name("/A"), mbf ? undefined : { versionMustBeFresh: false }))
    .resolves.toEqualName(new Name("/A").append(Version2, 2));
  producer.close();
});

const wrongNames = [
  new Name("/A/B/C/D"),
  new Name("/A/B").append(Segment2, 4),
  new Name("/A").append(Version2, 2).append("C"),
];

test.each(wrongNames)("discover wrong name %#", async (dataName) => {
  const producer = new Endpoint().produce("/A",
    async (interest) => new Data(dataName, Data.FreshnessPeriod(1000)));
  await expect(discoverVersion(new Name("/A"))).rejects.toThrow(/cannot extract version/);
  producer.close();
});

test("discover cancel", async () => {
  const p = discoverVersion(new Name("/A"));
  setTimeout(() => p.cancel(), 100);
  await expect(p).rejects.toThrow();
});
