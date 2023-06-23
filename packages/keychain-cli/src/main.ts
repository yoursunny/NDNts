import { exitHandler } from "@ndn/cli-common";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";

import { AddCertCommand } from "./add-cert";
import { DeleteCommand } from "./delete";
import { GenKeyCommand } from "./gen-key";
import { ImportNdnsecCommand } from "./import-ndnsec";
import { ImportSafeBagCommand } from "./import-safebag";
import { IssueCertCommand } from "./issue-cert";
import { ListCertsCommand } from "./list-certs";
import { ListKeysCommand } from "./list-keys";
import { Ndncert03CaCommand } from "./ndncert03-ca";
import { Ndncert03ClientCommand } from "./ndncert03-client";
import { Ndncert03MakeProfileCommand } from "./ndncert03-make-profile";
import { Ndncert03ProbeCommand } from "./ndncert03-probe";
import { Ndncert03ShowProfileCommand } from "./ndncert03-show-profile";
import { ShowCertCommand } from "./show-cert";

export const COMMAND = "ndnts-keychain";

try {
  await yargs(hideBin(process.argv))
    .scriptName(COMMAND)
    .command(GenKeyCommand)
    .command(ShowCertCommand)
    .command(DeleteCommand)
    .command(IssueCertCommand)
    .command(ListKeysCommand)
    .command(ListCertsCommand)
    .command(AddCertCommand)
    .command(ImportSafeBagCommand)
    .command(ImportNdnsecCommand)
    .command(Ndncert03MakeProfileCommand)
    .command(Ndncert03ShowProfileCommand)
    .command(Ndncert03CaCommand)
    .command(Ndncert03ProbeCommand)
    .command(Ndncert03ClientCommand)
    .demandCommand()
    .parseAsync();
} finally {
  exitHandler();
}
