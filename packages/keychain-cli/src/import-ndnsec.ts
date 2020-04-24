import { NdnsecKeyChain } from "@ndn/ndnsec";
import { CommandModule } from "yargs";

import { keyChain } from "./util";

export class ImportNdnsecCommand implements CommandModule {
  public command = "import-ndnsec";
  public describe = "copy keys from ndnsec";

  public async handler() {
    const source = new NdnsecKeyChain();
    await source.copyTo(keyChain);
  }
}
