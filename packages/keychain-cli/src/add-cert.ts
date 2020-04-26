import { CommandModule } from "yargs";

import { inputCertBase64, keyChain } from "./util";

export class AddCertCommand implements CommandModule {
  public command = "add-cert";
  public describe = "add certificate";

  public async handler() {
    const cert = await inputCertBase64();
    await keyChain.insertCert(cert);
  }
}
