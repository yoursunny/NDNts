import "loud-rejection/register";

import yargs from "yargs";

import { CloneCommand } from "./clone";
import { SafeBagCommand } from "./safebag";

yargs
.scriptName("ndnsec2ndnts")
.command(new SafeBagCommand())
.command(new CloneCommand())
.demandCommand()
.parse();
