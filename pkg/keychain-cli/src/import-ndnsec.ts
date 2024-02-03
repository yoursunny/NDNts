import { NdnsecKeyChain } from "@ndn/ndnsec";
import type { CommandModule } from "yargs";

import { keyChain } from "./util";

export const ImportNdnsecCommand: CommandModule = {
  command: "import-ndnsec",
  describe: "copy keys from ndnsec",

  async handler() {
    const source = new NdnsecKeyChain();
    await source.copyTo(keyChain);
  },
};
