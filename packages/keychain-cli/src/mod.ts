import "loud-rejection/register";

import yargs from "yargs";

import { AddCertCommand } from "./add-cert";
import { applyCommonArgs } from "./common-args";
import { DeleteCommand } from "./delete";
import { GenKeyCommand } from "./gen-key";
import { IssueCertCommand } from "./issue-cert";
import { ListCertsCommand } from "./list-certs";
import { ListKeysCommand } from "./list-keys";
import { ShowCertCommand } from "./show-cert";

yargs
.scriptName("ndntssec")
.middleware(applyCommonArgs)
.command(new GenKeyCommand())
.command(new ShowCertCommand())
.command(new DeleteCommand())
.command(new IssueCertCommand())
.command(new ListKeysCommand())
.command(new ListCertsCommand())
.command(new AddCertCommand())
.demandCommand()
.parse();
