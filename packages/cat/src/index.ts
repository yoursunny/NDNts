import loudRejection from "loud-rejection";
import yargs from "yargs";

import { GetSegmentedCommand } from "./get-segmented";
import { PutSegmentedCommand } from "./put-segmented";

loudRejection();

yargs
.scriptName("ndncat")
.command(new GetSegmentedCommand())
.command(new PutSegmentedCommand())
.demandCommand()
.parse();
