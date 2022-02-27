import yargs from "yargs";
import { hideBin } from "yargs/helpers";

import { applyCommonArgs, cleanupCommon } from "./common";
import { FileClientCommand } from "./file-client";
import { GetSegmentedCommand } from "./get-segmented";
import { PutSegmentedCommand } from "./put-segmented";

export const COMMAND = "ndncat";

void yargs(hideBin(process.argv))
  .scriptName(COMMAND)
  .option("convention", {
    choices: [1, 2, 3],
    default: 2,
    desc: "Naming Convention revision",
    type: "number",
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
