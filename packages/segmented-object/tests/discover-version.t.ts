import "@ndn/packet/test-fixture";

import { Forwarder, SimpleEndpoint } from "@ndn/fw";
import { Segment as Segment2, Version as Version2 } from "@ndn/naming-convention2";
import { Data, Name } from "@ndn/packet";

import { discoverVersion } from "..";

afterEach(() => Forwarder.deleteDefault());

test.each([false, true])("normal mbf=%p", async (mbf) => {
  const producer = new SimpleEndpoint().produce({
    prefix: new Name("/A"),
    async handler(interest) {
      expect(interest.name).toEqualName("/A");
      expect(interest.canBePrefix).toBeTruthy();
      expect(interest.mustBeFresh).toBe(mbf);
      const data = new Data(interest.name.append(Version2, 2).append(Segment2, 4));
      if (mbf) {
        data.freshnessPeriod = 1000;
      }
      return data;
    },
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

test.each(wrongNames)("wrong name %#", async (dataName) => {
  const producer = new SimpleEndpoint().produce({
    prefix: new Name("/A"),
    async handler(interest) {
      return new Data(dataName, Data.FreshnessPeriod(1000));
    },
  });
  await expect(discoverVersion(new Name("/A"))).rejects.toThrow(/cannot extract version/);
  producer.close();
});

test("abort", async () => {
  const p = discoverVersion(new Name("/A"));
  setTimeout(() => p.abort(), 100);
  await expect(p).rejects.toThrow();
});
