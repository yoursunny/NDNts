import stdout from "stdout-stream";
import type { CommandModule } from "yargs";

import { keyChain } from "./util";

export class ListKeysCommand implements CommandModule {
  public readonly command = "list-keys";
  public readonly describe = "list keys";
  public readonly aliases = ["list-key"];

  public async handler() {
    const names = await keyChain.listKeys();
    for (const name of names) {
      stdout.write(`${name}\n`);
    }
  }
}
