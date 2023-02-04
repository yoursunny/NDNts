import fs from "node:fs/promises";

import { exportClientConf } from "@ndn/ndncert";
import { Encoder } from "@ndn/tlv";
import stdout from "stdout-stream";
import type { Arguments, Argv, CommandModule } from "yargs";

import { inputCaProfile } from "./util";

interface Args {
  profile: string;
  out?: string;
  json?: boolean;
  clientconf?: boolean;
}

export class Ndncert03ShowProfileCommand implements CommandModule<{}, Args> {
  public readonly command = "ndncert03-show-profile";
  public readonly describe = "show/convert/retrieve CA profile of NDNCERT 0.3";

  public builder(argv: Argv): Argv<Args> {
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
  }

  public async handler(args: Arguments<Args>) {
    const profile = await inputCaProfile(args.profile);
    if (args.out) {
      await fs.writeFile(args.out, Encoder.encode(profile.data));
    }

    let output: unknown = profile;
    switch (true) {
      case args.clientconf: {
        output = exportClientConf(profile);
      }
      // fallthrough
      case args.json: {
        output = JSON.stringify(output, undefined, 2);
      }
      // fallthrough
      default: {
        stdout.write(`${output}\n`);
        break;
      }
    }
  }
}
