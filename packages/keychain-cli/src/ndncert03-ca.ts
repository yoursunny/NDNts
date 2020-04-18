import { openUplinks } from "@ndn/cli-common/src/mod";
import { CertificateName } from "@ndn/keychain";
import { CaProfile, Server } from "@ndn/ndncert";
import { Data } from "@ndn/packet";
import { DataStore, RepoProducer } from "@ndn/repo";
import { Decoder } from "@ndn/tlv";
import { promises as fs } from "graceful-fs";
import leveldown from "leveldown";
import { Arguments, Argv, CommandModule } from "yargs";

import { keyChain } from "./util";

interface Args {
  profile: string;
  store: string;
}

export class Ndncert03CaCommand implements CommandModule<{}, Args> {
  public command = "ndncert03-ca";
  public describe = "run NDNCERT 0.3 certificate authority";

  public builder(argv: Argv): Argv<Args> {
    return argv
      .option("profile", {
        demandOption: true,
        desc: "CA profile file",
        type: "string",
      })
      .option("store", {
        demandOption: true,
        desc: "repo store path",
        type: "string",
      });
  }

  public async handler(args: Arguments<Args>) {
    await openUplinks();

    const profile = await CaProfile.fromData(new Decoder(await fs.readFile(args.profile)).decode(Data));
    const certName = CertificateName.from(profile.cert.name);
    const key = await keyChain.getPrivateKey(certName.toKeyName().toName());

    const repo = new DataStore(leveldown(args.store));
    // eslint-disable-next-line no-new
    new RepoProducer(repo, { reg: RepoProducer.PrefixRegShorter(2) });
    Server.create({
      repo,
      profile,
      key,
    });
  }
}
