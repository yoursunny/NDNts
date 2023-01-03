import { NdnsecKeyChain } from "@ndn/ndnsec";
import type { CommandModule } from "yargs";

import { keyChain } from "./util";

export class ImportNdnsecCommand implements CommandModule {
  public readonly command = "import-ndnsec";
  public readonly describe = "copy keys from ndnsec";

  public async handler() {
    const source = new NdnsecKeyChain();
    await source.copyTo(keyChain);
  }
}
