import loudRejection from "loud-rejection";
import yargs from "yargs";

import { applyCommonArgs } from "./common-args";
import { GetSegmentedCommand } from "./get-segmented";
import { PutSegmentedCommand } from "./put-segmented";

loudRejection();

yargs
.scriptName("ndncat")
.option("router", {
  default: "localhost",
  desc: "router hostname",
  type: "string",
})
.option("nfd", {
  default: false,
  desc: "use NFD prefix registration command and tolerate Selectors",
  type: "boolean",
})
.option("convention02", {
  default: false,
  desc: "use 2014 Naming Convention",
  type: "boolean",
})
.middleware(applyCommonArgs)
.command(new GetSegmentedCommand())
.command(new PutSegmentedCommand())
.demandCommand()
.parse();
