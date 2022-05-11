import { closeUplinks } from "@ndn/cli-common";
import { exportClientConf } from "@ndn/ndncert";
import stdout from "stdout-stream";
import type { Arguments, Argv, CommandModule } from "yargs";

import { inputCaProfile } from "./util";

interface Args {
  profile: string;
  clientconf: boolean;
}

export class Ndncert03ShowProfileCommand implements CommandModule<{}, Args> {
  public command = "ndncert03-show-profile";
  public describe = "show CA profile of NDNCERT 0.3";

  public builder(argv: Argv): Argv<Args> {
    return argv
      .option("profile", {
        demandOption: true,
        desc: "CA profile file",
        type: "string",
      })
      .option("clientconf", {
        default: false,
        desc: "export as client.conf compatible with NDNCERT C++ implementation",
        type: "boolean",
      });
  }

  public async handler(args: Arguments<Args>) {
    try {
      const profile = await inputCaProfile(args.profile);
      if (args.clientconf) {
        stdout.write(JSON.stringify(exportClientConf(profile), undefined, 2));
      } else {
        stdout.write(`${profile}\n`);
      }
    } finally {
      closeUplinks();
    }
  }
}
