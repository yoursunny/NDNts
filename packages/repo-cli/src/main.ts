import yargs, { Argv } from "yargs";
import { hideBin } from "yargs/helpers";

import { FillBiCommand, FillStoreCommand } from "./fill";
import { ServerCommand } from "./server";

(yargs() as unknown as Argv)
  .scriptName("ndnts-repo")
  .command(new ServerCommand())
  .command(new FillStoreCommand())
  .command(new FillBiCommand())
  .demandCommand()
  .parse(hideBin(process.argv));
