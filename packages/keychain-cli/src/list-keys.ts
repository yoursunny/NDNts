import stdout from "stdout-stream";
import { CommandModule } from "yargs";

import { keyChain } from "./common-args";

async function main() {
  const names = await keyChain.listKeys();
  for (const name of names) {
    stdout.write(`${name}\n`);
  }
}

export class ListKeysCommand implements CommandModule {
  public command = "list-keys";
  public describe = "list keys";
  public aliases = ["list-key"];

  public handler() {
    main();
  }
}
