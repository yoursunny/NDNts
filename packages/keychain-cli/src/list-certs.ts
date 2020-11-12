import stdout from "stdout-stream";
import type { CommandModule } from "yargs";

import { keyChain } from "./util";

export class ListCertsCommand implements CommandModule {
  public command = "list-certs";
  public describe = "list certificates";
  public aliases = ["list", "list-cert"];

  public async handler() {
    const names = await keyChain.listCerts();
    for (const name of names) {
      stdout.write(`${name}\n`);
    }
  }
}
