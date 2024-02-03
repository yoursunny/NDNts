import { SafeBag } from "@ndn/ndnsec";
import type { CommandModule } from "yargs";

import { inputBase64, keyChain } from "./util";

interface Args {
  passphrase: string;
}

export const ImportSafeBagCommand: CommandModule<{}, Args> = {
  command: "import-safebag [filename]",
  describe: "import SafeBag",

  builder(argv) {
    return argv
      .option("passphrase", {
        demandOption: true,
        desc: "SafeBag passphrase",
        type: "string",
      });
  },

  async handler({ passphrase }) {
    const safeBag = await inputBase64(SafeBag);
    await safeBag.saveKeyPair(passphrase, keyChain);
    await keyChain.insertCert(safeBag.certificate);
  },
};
