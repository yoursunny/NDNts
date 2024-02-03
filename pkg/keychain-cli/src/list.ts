import type { Name } from "@ndn/packet";
import stdout from "stdout-stream";
import type { CommandModule } from "yargs";

import { keyChain } from "./util";

function outputList(names: readonly Name[]) {
  for (const name of names) {
    stdout.write(`${name}\n`);
  }
}

export const ListKeysCommand: CommandModule = {
  command: "list-keys",
  describe: "list keys",
  aliases: ["list-key"],

  async handler() {
    outputList(await keyChain.listKeys());
  },
};

export const ListCertsCommand: CommandModule = {
  command: "list-certs",
  describe: "list certificates",
  aliases: ["list", "list-cert"],

  async handler() {
    outputList(await keyChain.listCerts());
  },
};
