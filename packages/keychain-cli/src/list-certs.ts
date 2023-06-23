import stdout from "stdout-stream";
import type { CommandModule } from "yargs";

import { keyChain } from "./util";

export const ListCertsCommand: CommandModule = {
  command: "list-certs",
  describe: "list certificates",
  aliases: ["list", "list-cert"],

  async handler() {
    const names = await keyChain.listCerts();
    for (const name of names) {
      stdout.write(`${name}\n`);
    }
  },
};
