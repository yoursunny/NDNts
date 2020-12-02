import stdout from "stdout-stream";
import type { Arguments, Argv, CommandModule } from "yargs";

import { inputCaProfile } from "./util";

interface Args {
  profile: string;
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
      });
  }

  public async handler(args: Arguments<Args>) {
    const profile = await inputCaProfile(args.profile);
    stdout.write(`${profile}\n`);
  }
}
