import { exitHandler } from "@ndn/cli-common";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";

import { FillBiCommand, FillStoreCommand } from "./fill";
import { ServerCommand } from "./server";

export const COMMAND = "ndnts-repo";

try {
  await yargs(hideBin(process.argv))
    .scriptName(COMMAND)
    .strict()
    .command(ServerCommand)
    .command(FillStoreCommand)
    .command(FillBiCommand)
    .demandCommand()
    .parseAsync();
} finally {
  exitHandler();
}
