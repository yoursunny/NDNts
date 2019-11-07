import { CommandModule } from "yargs";

import { keyChain } from "./common-args";
import { inputCertBase64 } from "./util";

async function main() {
  const cert = await inputCertBase64();
  await keyChain.insertCert(cert);
}

export class AddCertCommand implements CommandModule {
  public command = "add-cert";
  public describe = "add certificate";

  public handler() {
    main();
  }
}
