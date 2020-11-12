import yargs, { Argv } from "yargs";

import { FillBiCommand, FillStoreCommand } from "./fill";
import { ServerCommand } from "./server";

(yargs() as unknown as Argv)
  .scriptName("ndntsrepo")
  .command(new ServerCommand())
  .command(new FillStoreCommand())
  .command(new FillBiCommand())
  .demandCommand()
  .parse();
