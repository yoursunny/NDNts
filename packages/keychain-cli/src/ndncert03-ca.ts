import { openUplinks } from "@ndn/cli-common/src/mod";
import { CertificateName } from "@ndn/keychain";
import { CaProfile, Server, ServerChallenge, ServerNopChallenge, ServerPinChallenge } from "@ndn/ndncert";
import { Data } from "@ndn/packet";
import { DataStore, RepoProducer } from "@ndn/repo";
import { Decoder, toHex } from "@ndn/tlv";
import { promises as fs } from "graceful-fs";
import leveldown from "leveldown";
import stdout from "stdout-stream";
import { Arguments, Argv, CommandModule } from "yargs";

import { keyChain } from "./util";

interface Args {
  profile: string;
  store: string;
  challenge: string[];
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
      })
      .option("challenge", {
        demandOption: true,
        array: true,
        choices: ["nop", "pin"],
        desc: "supported challenges",
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

    const challenges: ServerChallenge[] = [];
    for (const challengeId of args.challenge) {
      switch (challengeId) {
        case "nop":
          challenges.push(new ServerNopChallenge());
          break;
        case "pin": {
          const challenge = new ServerPinChallenge();
          challenge.on("newpin", (requestId, pin) => {
            stdout.write(`PinChallenge requestId=${toHex(requestId)} pin=${pin}\n`);
          });
          challenges.push(challenge);
          break;
        }
      }
    }

    Server.create({
      repo,
      profile,
      key,
      challenges,
    });
  }
}
