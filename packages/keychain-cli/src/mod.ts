import "loud-rejection/register";
import yargs from "yargs";

import { AddCertCommand } from "./add-cert";
import { DeleteCommand } from "./delete";
import { GenKeyCommand } from "./gen-key";
import { ImportNdnsecCommand } from "./import-ndnsec";
import { ImportSafeBagCommand } from "./import-safebag";
import { IssueCertCommand } from "./issue-cert";
import { ListCertsCommand } from "./list-certs";
import { ListKeysCommand } from "./list-keys";
import { NdncertClientCommand } from "./ndncert-client";
import { ShowCertCommand } from "./show-cert";

yargs
  .scriptName("ndntssec")
  .command(new GenKeyCommand())
  .command(new ShowCertCommand())
  .command(new DeleteCommand())
  .command(new IssueCertCommand())
  .command(new ListKeysCommand())
  .command(new ListCertsCommand())
  .command(new AddCertCommand())
  .command(new ImportSafeBagCommand())
  .command(new ImportNdnsecCommand())
  .command(new NdncertClientCommand())
  .demandCommand()
  .parse();
