import loudRejection from "loud-rejection";
import yargs from "yargs";

import { CloneCommand } from "./clone";
import { SafeBagCommand } from "./safebag";

loudRejection();

yargs
.scriptName("ndnsec2ndnts")
.command(new SafeBagCommand())
.command(new CloneCommand())
.demandCommand()
.parse();
