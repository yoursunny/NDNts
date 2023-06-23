import { Name } from "@ndn/packet";
import { retrieveMetadata } from "@ndn/rdr";
import { discoverVersion, fetch } from "@ndn/segmented-object";
import stdout from "stdout-stream";
import type { CommandModule } from "yargs";

import { checkVersionArg, type CommonArgs, Segment, Version } from "./util";

interface Args extends CommonArgs {
  name: Name;
  ver: string;
}

export const GetSegmentedCommand: CommandModule<CommonArgs, Args> = {
  command: "get-segmented <name>",
  describe: "retrieve segmented object",
  aliases: ["get"],

  builder(argv) {
    return argv
      .positional("name", {
        coerce: Name.from,
        demandOption: true,
        desc: "name prefix",
        type: "string",
      })
      .option("ver", {
        default: "rdr",
        desc: ["version number or discovery method",
          "none: no version component",
          "cbp: send Interest with CanBePrefix",
          "rdr: use RDR protocol"].join("\n"),
        type: "string",
      })
      .check(checkVersionArg(["none", "cbp", "rdr"]));
  },

  async handler({ name, ver }) {
    switch (ver) {
      case "none": {
        break;
      }
      case "cbp": {
        name = await discoverVersion(name, {
          segmentNumConvention: Segment,
          versionConvention: Version,
        });
        break;
      }
      case "rdr": {
        name = (await retrieveMetadata(name)).name;
        break;
      }
      default: {
        name = name.append(Version, Number.parseInt(ver, 10));
        break;
      }
    }

    await fetch(name, { segmentNumConvention: Segment }).pipe(stdout);
  },
};
