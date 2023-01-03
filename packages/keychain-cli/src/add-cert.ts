import type { CommandModule } from "yargs";

import { inputCertBase64, keyChain } from "./util";

export class AddCertCommand implements CommandModule {
  public readonly command = "add-cert";
  public readonly describe = "add certificate";

  public async handler() {
    const cert = await inputCertBase64();
    await keyChain.insertCert(cert);
  }
}
