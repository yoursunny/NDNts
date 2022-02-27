import yargs from "yargs";
import { hideBin } from "yargs/helpers";

import { FillBiCommand, FillStoreCommand } from "./fill";
import { ServerCommand } from "./server";

export const COMMAND = "ndnts-repo";

void yargs(hideBin(process.argv))
  .scriptName(COMMAND)
  .command(new ServerCommand())
  .command(new FillStoreCommand())
  .command(new FillBiCommand())
  .demandCommand()
  .parse();
