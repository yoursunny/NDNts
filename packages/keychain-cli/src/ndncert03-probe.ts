import { openUplinks } from "@ndn/cli-common";
import { requestProbe } from "@ndn/ndncert";
import { Name } from "@ndn/packet";
import stdout from "stdout-stream";
import type { Arguments, Argv, CommandModule } from "yargs";

import { inputCaProfile, ppOption, promptProbeParameters } from "./util";

interface Args {
  profile: string;
  pp: unknown;
}

export class Ndncert03ProbeCommand implements CommandModule<{}, Args> {
  public command = "ndncert03-probe";
  public describe = "run probe procedure against NDNCERT 0.3 CA";

  public builder(argv: Argv): Argv<Args> {
    return argv
      .option("profile", {
        demandOption: true,
        desc: "CA profile file",
        type: "string",
      })
      .option("pp", ppOption);
  }

  public async handler(args: Arguments<Args>) {
    await openUplinks();

    const profile = await inputCaProfile(args.profile);
    const parameters = await promptProbeParameters(profile, args.pp as string[]);

    const { entries, redirects } = await requestProbe({
      profile,
      parameters,
    });
    const j = JSON.stringify({ entries, redirects },
      (key, value) => value instanceof Name ? `${value}` : value, 2);
    stdout.write(`${j}\n`);
  }
}