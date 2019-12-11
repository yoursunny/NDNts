import stdout from "stdout-stream";
import { CommandModule } from "yargs";

import { keyChain } from "./util";

async function main() {
  const names = await keyChain.listCerts();
  for (const name of names) {
    stdout.write(`${name}\n`);
  }
}

export class ListCertsCommand implements CommandModule {
  public command = "list-certs";
  public describe = "list certificates";
  public aliases = ["list", "list-cert"];

  public handler() {
    main();
  }
}
