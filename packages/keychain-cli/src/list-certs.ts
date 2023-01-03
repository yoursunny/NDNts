import stdout from "stdout-stream";
import type { CommandModule } from "yargs";

import { keyChain } from "./util";

export class ListCertsCommand implements CommandModule {
  public readonly command = "list-certs";
  public readonly describe = "list certificates";
  public readonly aliases = ["list", "list-cert"];

  public async handler() {
    const names = await keyChain.listCerts();
    for (const name of names) {
      stdout.write(`${name}\n`);
    }
  }
}
