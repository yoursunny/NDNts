import loudRejection from "loud-rejection";
import yargs from "yargs";

import { CloneCommand } from "./clone";
import { applyCommonArgs } from "./common-args";
import { SafeBagCommand } from "./safebag";

loudRejection();

yargs
.scriptName("ndnsec2ndnts")
.option("locator", {
  demandOption: true,
  desc: "KeyChain locator",
  type: "string",
})
.middleware(applyCommonArgs)
.command(new SafeBagCommand())
.command(new CloneCommand())
.demandCommand()
.parse();
