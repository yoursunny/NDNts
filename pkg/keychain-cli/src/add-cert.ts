import type { CommandModule } from "yargs";

import { inputCertBase64, keyChain } from "./util";

export const AddCertCommand: CommandModule = {
  command: "add-cert",
  describe: "add certificate",

  async handler() {
    const cert = await inputCertBase64();
    await keyChain.insertCert(cert);
  },
};
