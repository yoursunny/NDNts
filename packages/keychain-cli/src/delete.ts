import { Name } from "@ndn/packet";
import stdout from "stdout-stream";
import type { CommandModule } from "yargs";

import { keyChain } from "./util";

interface Args {
  name: string;
}

export const DeleteCommand: CommandModule<{}, Args> = {
  command: "delete <name>",
  describe: "delete keys and certificates",

  builder(argv) {
    return argv
      .positional("name", {
        demandOption: true,
        desc: "name prefix",
        type: "string",
      });
  },

  async handler({ name }) {
    const n = new Name(name);
    const certNames = await keyChain.listCerts(n);
    for (const certName of certNames) {
      stdout.write(`${certName}\n`);
      await keyChain.deleteCert(certName);
    }
    const keyNames = await keyChain.listKeys(n);
    for (const keyName of keyNames) {
      stdout.write(`${keyName}\n`);
      await keyChain.deleteKey(keyName);
    }
  },
};
