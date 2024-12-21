import { closeUplinks, openUplinks } from "@ndn/cli-common";
import { CsInfo, invokeCsErase, list } from "@ndn/nfdmgmt";
import { Name } from "@ndn/packet";

await openUplinks();

console.group("[CsInfo]");
for (const csInfo of await list(CsInfo)) {
  console.log(csInfo.toString());
}
console.groupEnd();
console.log();

console.group("[cs/erase]");
console.log(await invokeCsErase(new Name("/ndn")));
console.groupEnd();
console.log();

closeUplinks();
