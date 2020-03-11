import { Name } from "@ndn/packet";
import { serve } from "@ndn/segmented-object";
import { Arguments, Argv, CommandModule } from "yargs";

import { CommonArgs, segmentNumConvention, signer, versionConvention } from "./common-args";

interface Args extends CommonArgs {
  name: string;
  ver: string;
}

function main({ name, ver }: Args) {
  serve(new Name(name), process.stdin, {
    segmentNumConvention,
    signer,
    version: ver === "none" ? false : ver === "now" ? true : parseInt(ver, 10),
    versionConvention,
  });
}

export class PutSegmentedCommand implements CommandModule<CommonArgs, Args> {
  public command = "put-segmented <name>";
  public describe = "publish segmented object";
  public aliases = ["put"];

  public builder(argv: Argv<CommonArgs>): Argv<Args> {
    return argv
      .positional("name", {
        desc: "name prefix",
        type: "string",
      })
      .demandOption("name")
      .option("ver", {
        default: "now",
        desc: "version number; 'none' to omit version component, 'now' to use current timestamp",
        type: "string",
      })
      .check(({ ver }) => {
        if (!(["none", "now"].includes(ver) || parseInt(ver, 10) >= 0)) {
          throw new Error("--ver must be either a non-negative integer or 'none' or 'now'");
        }
        return true;
      });
  }

  public handler(args: Arguments<Args>) {
    main(args);
  }
}
