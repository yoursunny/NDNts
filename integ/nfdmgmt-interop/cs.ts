import { closeUplinks, openUplinks } from "@ndn/cli-common";
import { CsInfo, list } from "@ndn/nfdmgmt";

await openUplinks();

for (const csInfo of await list(CsInfo)) {
  console.log(csInfo.toString());
}

closeUplinks();
