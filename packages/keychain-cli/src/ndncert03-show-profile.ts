import { CaProfile } from "@ndn/ndncert";
import { Data } from "@ndn/packet";
import { Decoder } from "@ndn/tlv";
import { promises as fs } from "graceful-fs";
import stdout from "stdout-stream";
import { Arguments, Argv, CommandModule } from "yargs";

interface Args {
  profile: string;
}

export class Ndncert03ShowProfileCommand implements CommandModule<{}, Args> {
  public command = "ndncert03-show-profile";
  public describe = "show CA profile of NDNCERT 0.3";

  public builder(argv: Argv): Argv<Args> {
    return argv
      .option("profile", {
        demandOption: true,
        desc: "CA profile file",
        type: "string",
      });
  }

  public async handler(args: Arguments<Args>) {
    const profile = await CaProfile.fromData(new Decoder(await fs.readFile(args.profile)).decode(Data));
    stdout.write(`${profile}\n`);
  }
}
