import { closeUplinks, openUplinks } from "@ndn/cli-common";
import { list, StrategyChoice } from "@ndn/nfdmgmt";

await openUplinks();

for (const sc of await list(StrategyChoice)) {
  console.log(sc.toString());
}

closeUplinks();
