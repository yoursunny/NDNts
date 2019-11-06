import loudRejection from "loud-rejection";
import yargs from "yargs";

import { applyCommonArgs } from "./common-args";
import { GetSegmentedCommand } from "./get-segmented";
import { PutSegmentedCommand } from "./put-segmented";

loudRejection();

yargs
.scriptName("ndncat")
.option("pkttrace", {
  default: false,
  desc: "enable packet tracing",
  type: "boolean",
})
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
.option("regkeychain", {
  desc: "KeyChain locator for prefix registration",
  implies: "nfd",
  type: "string",
})
.option("regkey", {
  desc: "key name for prefix registration (default is first key in the KeyChain)",
  implies: "regkeychain",
  type: "string",
})
.option("reglocalhop", {
  default: false,
  desc: "use /localhop/nfd prefix to send prefix registration command",
  implies: "nfd",
  type: "boolean",
})
.option("convention1", {
  default: false,
  desc: "use 2014 Naming Convention",
  type: "boolean",
})
.middleware(applyCommonArgs)
.command(new GetSegmentedCommand())
.command(new PutSegmentedCommand())
.demandCommand()
.parse();
