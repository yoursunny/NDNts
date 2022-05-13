import { Name } from "@ndn/packet";
import type { Arguments, Argv, CommandModule } from "yargs";

import { keyChain, printCertBase64 } from "./util";

interface Args {
  name: string;
}

export class ShowCertCommand implements CommandModule<{}, Args> {
  public command = "show-cert <name>";
  public describe = "show certificate";

  public builder(argv: Argv): Argv<Args> {
    return argv
      .positional("name", {
        demandOption: true,
        desc: "certificate name or prefix",
        type: "string",
      });
  }

  public async handler({ name }: Arguments<Args>) {
    const certNames = await keyChain.listCerts(new Name(name));
    for (const certName of certNames) {
      const cert = await keyChain.getCert(certName);
      printCertBase64(cert);
    }
  }
}
