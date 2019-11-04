import { CommandModule } from "yargs";

import { ndnsec } from "..";
import { CommonArgs, keyChain } from "./common-args";

async function main() {
  const names = await ndnsec.listKeys();
  for (const name of names) {
    await ndnsec.importKey(name, keyChain);
  }
}

export class CloneCommand implements CommandModule<CommonArgs> {
  public command = "clone";
  public describe = "import all keys from ndnsec";

  public handler() {
    main();
  }
}
