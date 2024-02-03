import { Name } from "@ndn/packet";
import type { CommandModule } from "yargs";

import { keyChain, printCertBase64 } from "./util";

interface Args {
  name: Name;
}

export const ShowCertCommand: CommandModule<{}, Args> = {
  command: "show-cert <name>",
  describe: "show certificate",

  builder(argv) {
    return argv
      .positional("name", {
        coerce: Name.from,
        demandOption: true,
        desc: "certificate name or prefix",
        type: "string",
      });
  },

  async handler({ name }) {
    const certNames = await keyChain.listCerts(name);
    for (const certName of certNames) {
      const cert = await keyChain.getCert(certName);
      printCertBase64(cert);
    }
  },
};
