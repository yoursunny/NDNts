import { exportKey as ndnsecExportKey, listKeys as ndnsecListKeys } from "@ndn/ndnsec";
import { Name } from "@ndn/packet";
import stdout from "stdout-stream";
import { Arguments, Argv, CommandModule } from "yargs";

import { keyChain } from "./util";

interface Args {
  prefix: string;
}

async function main({ prefix: prefixUri }: Args) {
  const PASSPHRASE = "PASSPHRASE";
  const prefix = new Name(prefixUri);
  const names = ndnsecListKeys();
  for (const name of names.filter((n) => prefix.isPrefixOf(n))) {
    const safeBag = ndnsecExportKey(name, PASSPHRASE);
    await safeBag.saveKeyPair(PASSPHRASE, keyChain);
    await keyChain.insertCert(safeBag.certificate);
    stdout.write(`${name}\n`);
  }
}

export class ImportNdnsecCommand implements CommandModule<{}, Args> {
  public command = "import-ndnsec";
  public describe = "import keys from ndnsec";

  public builder(argv: Argv): Argv<Args> {
    return argv
      .option("prefix", {
        default: "/",
        desc: "only import keys under prefix",
        type: "string",
      });
  }

  public handler(args: Arguments<Args>) {
    main(args);
  }
}
