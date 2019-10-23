import { Forwarder, SimpleEndpoint } from "@ndn/fw";
import { Data } from "@ndn/l3pkt";
import { Name } from "@ndn/name";
import "@ndn/name/test-fixture";
import { Segment as Segment03, Version as Version03 } from "@ndn/naming-convention-03";

import { discoverVersion } from "../src";

afterEach(() => Forwarder.deleteDefault());

test.each([false, true])("normal mbf=%p", async (mbf) => {
  const producer = new SimpleEndpoint().produce({
    prefix: new Name("/A"),
    async handler(interest) {
      expect(interest.name).toEqualName("/A");
      expect(interest.canBePrefix).toBeTruthy();
      expect(interest.mustBeFresh).toBe(mbf);
      const data = new Data(interest.name.append(Version03, 2).append(Segment03, 4));
      if (mbf) {
        data.freshnessPeriod = 1000;
      }
      return data;
    },
  });
  await expect(discoverVersion(new Name("/A"), mbf ? undefined : { versionMustBeFresh: false }))
        .resolves.toEqualName(new Name("/A").append(Version03, 2));
  producer.close();
});

const wrongNames = [
  new Name("/A/B/C/D"),
  new Name("/A/B").append(Segment03, 4),
  new Name("/A").append(Version03, 2).append("C"),
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
