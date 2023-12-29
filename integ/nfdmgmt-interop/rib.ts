import { closeUplinks, openUplinks } from "@ndn/cli-common";
import { list, RibEntry } from "@ndn/nfdmgmt";

await openUplinks();

for (const ribEntry of await list(RibEntry)) {
  console.log(ribEntry.toString());
}

closeUplinks();
