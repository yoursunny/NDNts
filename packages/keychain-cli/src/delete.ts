import { Name } from "@ndn/packet";
import stdout from "stdout-stream";
import type { CommandModule } from "yargs";

import { keyChain } from "./util";

interface Args {
  name: Name;
}

export const DeleteCommand: CommandModule<{}, Args> = {
  command: "delete <name>",
  describe: "delete keys and certificates",

  builder(argv) {
    return argv
      .positional("name", {
        coerce: Name.from,
        demandOption: true,
        desc: "name prefix",
        type: "string",
      });
  },

  async handler({ name }) {
    const certNames = await keyChain.listCerts(name);
    for (const certName of certNames) {
      stdout.write(`${certName}\n`);
      await keyChain.deleteCert(certName);
    }
    const keyNames = await keyChain.listKeys(name);
    for (const keyName of keyNames) {
      stdout.write(`${keyName}\n`);
      await keyChain.deleteKey(keyName);
    }
  },
};
