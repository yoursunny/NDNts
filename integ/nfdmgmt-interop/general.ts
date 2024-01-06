import { closeUplinks, openUplinks } from "@ndn/cli-common";
import { GeneralStatus, list } from "@ndn/nfdmgmt";

await openUplinks();

for (const generalStatus of await list(GeneralStatus)) {
  console.log(generalStatus.toString());
  console.log("uptime", generalStatus.uptime);
}

closeUplinks();
