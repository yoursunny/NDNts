import yargs from "yargs";
import { hideBin } from "yargs/helpers";

import { FillBiCommand, FillStoreCommand } from "./fill";
import { ServerCommand } from "./server";

void yargs(hideBin(process.argv))
  .scriptName("ndnts-repo")
  .command(new ServerCommand())
  .command(new FillStoreCommand())
  .command(new FillBiCommand())
  .demandCommand()
  .parse();
