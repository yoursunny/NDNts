import { Name } from "@ndn/name";
import stdout from "stdout-stream";
import { Arguments, Argv, CommandModule } from "yargs";

import { CommonArgs, keyChain } from "./common-args";

interface Args extends CommonArgs {
  name: string;
}

async function main({ name }: Args) {
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

export class DeleteCommand implements CommandModule<CommonArgs, Args> {
  public command = "delete <name>";
  public describe = "delete keys and certificates";

  public builder(argv: Argv<CommonArgs>): Argv<Args> {
    return argv
    .positional("name", {
      desc: "name prefix",
      type: "string",
    })
    .demandOption("name");
  }

  public handler(args: Arguments<Args>) {
    main(args);
  }
}
