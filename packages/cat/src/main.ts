import yargs from "yargs";
import { hideBin } from "yargs/helpers";

import { applyCommonArgs, cleanupCommon } from "./common";
import { FileClientCommand } from "./file-client";
import { GetSegmentedCommand } from "./get-segmented";
import { PutSegmentedCommand } from "./put-segmented";

// TypeDoc needs an export to include the package.
export const COMMAND = "ndncat";

void yargs(hideBin(process.argv))
  .scriptName(COMMAND)
  .option("convention1", {
    default: false,
    desc: "use 2014 Naming Convention",
    type: "boolean",
  })
  .middleware(applyCommonArgs)
  .command(new GetSegmentedCommand())
  .command(new PutSegmentedCommand())
  .command(new FileClientCommand())
  .demandCommand()
  .exitProcess(false)
  .parseAsync()
  .catch(() => undefined)
  .finally(cleanupCommon);
