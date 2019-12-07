import { openKeyChain } from "@ndn/cli-common";
import { CommandModule } from "yargs";

import { ndnsec } from "../mod";

async function main() {
  const keyChain = openKeyChain();
  const names = await ndnsec.listKeys();
  for (const name of names) {
    await ndnsec.importKey(name, keyChain);
  }
}

export class CloneCommand implements CommandModule {
  public command = "clone";
  public describe = "import all keys from ndnsec";

  public handler() {
    main();
  }
}
