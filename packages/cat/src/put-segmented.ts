import { Name } from "@ndn/name";
import { serve } from "@ndn/segmented-object";
import { Arguments, Argv, CommandModule } from "yargs";

import { CommonArgs, segmentNumConvention } from "./common-args";

interface Args extends CommonArgs {
  name: string;
}

async function main(args: Args) {
  const name = new Name(args.name);
  serve(name, process.stdin, { segmentNumConvention });
}

export class PutSegmentedCommand implements CommandModule<CommonArgs, Args> {
  public command = "put-segmented <name>";
  public describe = "publish segmented object";
  public aliases = ["put"];

  public builder(argv: Argv<CommonArgs>): Argv<Args> {
    return argv
    .positional("name", {
      desc: "versioned name prefix",
      type: "string",
    })
    .demandOption("name");
  }

  public handler(args: Arguments<Args>) {
    main(args);
  }
}
