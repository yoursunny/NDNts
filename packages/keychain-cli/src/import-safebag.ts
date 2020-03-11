import { SafeBag } from "@ndn/ndnsec";
import { Arguments, Argv, CommandModule } from "yargs";

import { inputBase64, keyChain } from "./util";

interface Args {
  passphrase: string;
}

async function main({ passphrase }: Args) {
  const safeBag = await inputBase64(SafeBag);
  await safeBag.saveKeyPair(passphrase, keyChain);
  await keyChain.insertCert(safeBag.certificate);
}

export class ImportSafeBagCommand implements CommandModule<{}, Args> {
  public command = "import-safebag [filename]";
  public describe = "import SafeBag";

  public builder(argv: Argv): Argv<Args> {
    return argv
      .option("passphrase", {
        demandOption: true,
        desc: "SafeBag passphrase",
        type: "string",
      });
  }

  public handler(args: Arguments<Args>) {
    main(args);
  }
}
