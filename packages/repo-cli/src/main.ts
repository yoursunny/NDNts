import yargs from "yargs";

import { FillBiCommand, FillStoreCommand } from "./fill";
import { ServerCommand } from "./server";

yargs
  .scriptName("ndntsrepo")
  .command(new ServerCommand())
  .command(new FillStoreCommand())
  .command(new FillBiCommand())
  .demandCommand()
  .parse();
