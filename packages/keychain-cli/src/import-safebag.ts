import { SafeBag } from "@ndn/ndnsec";
import type { Arguments, Argv, CommandModule } from "yargs";

import { inputBase64, keyChain } from "./util";

interface Args {
  passphrase: string;
}

export class ImportSafeBagCommand implements CommandModule<{}, Args> {
  public readonly command = "import-safebag [filename]";
  public readonly describe = "import SafeBag";

  public builder(argv: Argv): Argv<Args> {
    return argv
      .option("passphrase", {
        demandOption: true,
        desc: "SafeBag passphrase",
        type: "string",
      });
  }

  public async handler({ passphrase }: Arguments<Args>) {
    const safeBag = await inputBase64(SafeBag);
    await safeBag.saveKeyPair(passphrase, keyChain);
    await keyChain.insertCert(safeBag.certificate);
  }
}
