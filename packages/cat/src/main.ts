import yargs from "yargs";
import { hideBin } from "yargs/helpers";

import { GetSegmentedCommand } from "./get-segmented";
import { PutSegmentedCommand } from "./put-segmented";
import { applyCommonArgs } from "./util";

void yargs(hideBin(process.argv))
  .scriptName("ndncat")
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
