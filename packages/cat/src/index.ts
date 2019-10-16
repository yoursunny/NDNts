#!/usr/bin/env node

import loudRejection from "loud-rejection";
import yargs from "yargs";

loudRejection();

yargs
.scriptName("ndncat")
.commandDir("cmd", { extensions: ["js", "ts"] })
.demandCommand()
.parse();
