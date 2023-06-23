import stdout from "stdout-stream";
import type { CommandModule } from "yargs";

import { keyChain } from "./util";

export const ListKeysCommand: CommandModule = {
  command: "list-keys",
  describe: "list keys",
  aliases: ["list-key"],

  async handler() {
    const names = await keyChain.listKeys();
    for (const name of names) {
      stdout.write(`${name}\n`);
    }
  },
};
