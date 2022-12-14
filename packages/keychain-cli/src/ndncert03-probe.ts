import { openUplinks } from "@ndn/cli-common";
import { type ParameterKV, requestProbe } from "@ndn/ndncert";
import { Name } from "@ndn/packet";
import { toUtf8 } from "@ndn/util";
import getStdin from "get-stdin";
import stdout from "stdout-stream";
import type { Arguments, Argv, CommandModule } from "yargs";

import { inputCaProfile } from "./util";

interface Args {
  profile: string;
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
      });
  }

  public async handler(args: Arguments<Args>) {
    await openUplinks();

    const inputParameters = JSON.parse(await getStdin());
    const profile = await inputCaProfile(args.profile);
    const parameters: ParameterKV = {};
    for (const key of profile.probeKeys) {
      parameters[key] = toUtf8(String(inputParameters[key]));
    }

    const { entries, redirects } = await requestProbe({
      profile,
      parameters,
    });
    const j = JSON.stringify({ entries, redirects },
      (key, value) => value instanceof Name ? `${value}` : value, 2);
    stdout.write(`${j}\n`);
  }
}
