import { closeUplinks, openUplinks } from "@ndn/cli-common";
import { CsInfo, invokeCsErase, list } from "@ndn/nfdmgmt";
import { Name } from "@ndn/packet";

await openUplinks();

for (const csInfo of await list(CsInfo)) {
  console.log(csInfo.toString());
}

console.log(await invokeCsErase(new Name("/ndn")));

closeUplinks();
