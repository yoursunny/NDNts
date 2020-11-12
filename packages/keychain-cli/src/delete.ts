import { Name } from "@ndn/packet";
import stdout from "stdout-stream";
import type { Arguments, Argv, CommandModule } from "yargs";

import { keyChain } from "./util";

interface Args {
  name: string;
}

export class DeleteCommand implements CommandModule<{}, Args> {
  public command = "delete <name>";
  public describe = "delete keys and certificates";

  public builder(argv: Argv): Argv<Args> {
    return argv
      .positional("name", {
        desc: "name prefix",
        type: "string",
      })
      .demandOption("name");
  }

  public async handler({ name }: Arguments<Args>) {
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
  }
}
