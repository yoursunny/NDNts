import { openUplinks } from "@ndn/cli-common";
import { produce } from "@ndn/endpoint";
import { PrefixAnn } from "@ndn/nfdmgmt";
import { Data } from "@ndn/packet";

await openUplinks();

const pa = await PrefixAnn.build({
  announced: "/localhost/demo-prefixann",
  expirationPeriod: 600000,
});

produce(
  pa.announced.append("ping"),
  async (interest) => new Data(interest.name),
  {
    announcement: pa,
  },
);
