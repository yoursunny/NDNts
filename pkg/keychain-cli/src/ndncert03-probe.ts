import { openUplinks } from "@ndn/cli-common";
import { requestProbe } from "@ndn/ndncert";
import { Name } from "@ndn/packet";
import stdout from "stdout-stream";
import type { CommandModule } from "yargs";

import { inputCaProfile, PPOption, promptProbeParameters } from "./util";

interface Args {
  profile: string;
  pp: PPOption;
}

export const Ndncert03ProbeCommand: CommandModule<{}, Args> = {
  command: "ndncert03-probe",
  describe: "run probe procedure against NDNCERT 0.3 CA",

  builder(argv) {
    return argv
      .option("profile", {
        demandOption: true,
        desc: "CA profile file",
        type: "string",
      })
      .option("pp", PPOption.def);
  },

  async handler({ profile: profileFile, pp }) {
    await openUplinks();

    const profile = await inputCaProfile(profileFile);
    const parameters = await promptProbeParameters(profile, pp as string[]);

    const { entries, redirects } = await requestProbe({
      profile,
      parameters,
    });
    const j = JSON.stringify({ entries, redirects },
      (key, value) => value instanceof Name ? `${value}` : value, 2);
    stdout.write(`${j}\n`);
  },
};
