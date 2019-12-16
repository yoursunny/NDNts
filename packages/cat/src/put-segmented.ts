import { Name } from "@ndn/packet";
import { serve } from "@ndn/segmented-object";
import { Arguments, Argv, CommandModule } from "yargs";

import { CommonArgs, segmentNumConvention, signer, versionConvention } from "./common-args";

interface Args extends CommonArgs {
  name: string;
  ver: number;
}

function main({ name, ver }: Args) {
  serve(new Name(name), process.stdin, {
    segmentNumConvention,
    signer,
    version: ver >= 0 ? ver : ver === -2,
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
      default: -2,
      desc: "version number; -1 to omit version component, -2 to use current timestamp",
      type: "number",
    });
  }

  public handler(args: Arguments<Args>) {
    main(args);
  }
}
