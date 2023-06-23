import { exitHandler } from "@ndn/cli-common";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";

import { FileClientCommand } from "./file-client";
import { GetSegmentedCommand } from "./get-segmented";
import { PutSegmentedCommand } from "./put-segmented";
import { applyCommonArgs } from "./util";

export const COMMAND = "ndncat";

try {
  await yargs(hideBin(process.argv))
    .scriptName(COMMAND)
    .option("convention", {
      choices: [1, 2, 3],
      default: 3,
      desc: "Naming Convention revision",
      type: "number",
    })
    .middleware(applyCommonArgs)
    .command(GetSegmentedCommand)
    .command(PutSegmentedCommand)
    .command(FileClientCommand)
    .demandCommand()
    .parseAsync();
} finally {
  exitHandler();
}
