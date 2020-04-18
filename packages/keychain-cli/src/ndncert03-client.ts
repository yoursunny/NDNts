import { closeUplinks, openUplinks } from "@ndn/cli-common/src/mod";
import { KeyName } from "@ndn/keychain";
import { CaProfile, requestCertificate } from "@ndn/ndncert";
import { Data } from "@ndn/packet";
import { Decoder } from "@ndn/tlv";
import { promises as fs } from "graceful-fs";
import stdout from "stdout-stream";
import { Arguments, Argv, CommandModule } from "yargs";

import { keyChain } from "./util";

interface Args {
  profile: string;
  key: string;
}

export class Ndncert03ClientCommand implements CommandModule<{}, Args> {
  public command = "ndncert03-client";
  public describe = "request certificate via NDNCERT 0.3";

  public builder(argv: Argv): Argv<Args> {
    return argv
      .option("profile", {
        demandOption: true,
        desc: "CA profile file",
        type: "string",
      })
      .option("key", {
        demandOption: true,
        desc: "key name",
        type: "string",
      });
  }

  public async handler(args: Arguments<Args>) {
    await openUplinks();
    const profile = await CaProfile.fromData(new Decoder(await fs.readFile(args.profile)).decode(Data));
    const [privateKey, publicKey] = await keyChain.getKeyPair(KeyName.create(args.key).toName());
    const cert = await requestCertificate({
      profile,
      privateKey,
      publicKey,
    });
    stdout.write(`${await cert.data.computeFullName()}\n`);
    await keyChain.insertCert(cert);
    closeUplinks();
  }
}
