import { serveMetadata } from "@ndn/rdr";
import { serve, serveVersioned, StreamChunkSource } from "@ndn/segmented-object";
import { Arguments, Argv, CommandModule } from "yargs";

import { CommonArgs, segmentNumConvention, signer, versionConvention } from "./common-args";

interface Args extends CommonArgs {
  name: string;
  rdr: boolean;
  ver: string;
}

function main({ name, rdr, ver }: Args) {
  const serveFunc = ver === "none" ? serve : serveVersioned;
  const server = serveFunc(name, new StreamChunkSource(process.stdin), {
    segmentNumConvention,
    signer,
    version: ver === "now" ? undefined : Number.parseInt(ver, 10),
    versionConvention,
  });
  if (ver !== "none" && rdr) {
    serveMetadata({ name: server.prefix }, { signer });
  }
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
      .option("rdr", {
        default: true,
        desc: "publish RDR metadata packet",
        type: "boolean",
      })
      .option("ver", {
        default: "now",
        desc: "version number; 'none' to omit version component, 'now' to use current timestamp",
        type: "string",
      })
      .check(({ ver }) => {
        if (!(["none", "now"].includes(ver) || Number.parseInt(ver, 10) >= 0)) {
          throw new Error("--ver must be either a non-negative integer or 'none' or 'now'");
        }
        return true;
      });
  }

  public handler(args: Arguments<Args>) {
    main(args);
  }
}
