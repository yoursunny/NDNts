import fs from "node:fs/promises";

import { exportClientConf } from "@ndn/ndncert";
import { Encoder } from "@ndn/tlv";
import stdout from "stdout-stream";
import type { CommandModule } from "yargs";

import { inputCaProfile } from "./util";

interface Args {
  profile: string;
  out?: string;
  json?: boolean;
  clientconf?: boolean;
}

export const Ndncert03ShowProfileCommand: CommandModule<{}, Args> = {
  command: "ndncert03-show-profile",
  describe: "show/convert/retrieve CA profile of NDNCERT 0.3",

  builder(argv) {
    return argv
      .option("profile", {
        demandOption: true,
        desc: "CA profile file",
        type: "string",
      })
      .option("out", {
        desc: "binary output filename",
        type: "string",
      })
      .option("json", {
        desc: "export as JSON",
        type: "boolean",
      })
      .option("clientconf", {
        desc: "export as client.conf compatible with NDNCERT C++ implementation",
        type: "boolean",
        conflicts: "json",
      });
  },

  async handler({ profile: profileFile, out: outFile, json = false, clientconf = false }) {
    const profile = await inputCaProfile(profileFile);
    if (outFile) {
      await fs.writeFile(outFile, Encoder.encode(profile.data));
    }

    let output: unknown = profile;
    switch (true) {
      case clientconf: {
        output = exportClientConf(profile);
      }
      // fallthrough
      case json: {
        output = JSON.stringify(output, undefined, 2);
      }
      // fallthrough
      default: {
        stdout.write(`${output}\n`);
        break;
      }
    }
  },
};
