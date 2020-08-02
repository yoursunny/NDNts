import { closeUplinks, openUplinks } from "@ndn/cli-common";
import { CertNaming } from "@ndn/keychain";
import { CaProfile, ClientChallenge, ClientNopChallenge, ClientPinChallenge, requestCertificate } from "@ndn/ndncert";
import { NdnsecKeyChain } from "@ndn/ndnsec";
import { Data, Name } from "@ndn/packet";
import { Decoder, toHex } from "@ndn/tlv";
import { promises as fs } from "graceful-fs";
import prompts from "prompts";
import stdout from "stdout-stream";
import { Arguments, Argv, CommandModule } from "yargs";

import { keyChain as defaultKeyChain } from "./util";

interface Args {
  profile: string;
  ndnsec: boolean;
  key: string;
  challenge: string[];
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
      .option("ndnsec", {
        default: false,
        desc: "use ndn-cxx KeyChain",
        type: "boolean",
      })
      .option("key", {
        demandOption: true,
        desc: "key name",
        type: "string",
      })
      .option("challenge", {
        demandOption: true,
        array: true,
        choices: ["nop", "pin"],
        desc: "supported challenges",
        type: "string",
      })
      .check(({ key }) => {
        return CertNaming.isKeyName(new Name(key));
      });
  }

  public async handler(args: Arguments<Args>) {
    await openUplinks();
    const keyChain = args.ndnsec ? new NdnsecKeyChain() : defaultKeyChain;
    const profile = await CaProfile.fromData(new Decoder(await fs.readFile(args.profile)).decode(Data));
    const { signer: privateKey, verifier: publicKey } = await keyChain.getKeyPair(new Name(args.key));

    const challenges: ClientChallenge[] = [];
    for (const challengeId of args.challenge) {
      switch (challengeId) {
        case "nop":
          challenges.push(new ClientNopChallenge());
          break;
        case "pin": {
          challenges.push(new ClientPinChallenge(async ({ requestId }) => {
            const response = await prompts({
              type: "text",
              name: "code",
              message: `PIN for request ${toHex(requestId)}:`,
            });
            return response.code;
          }));
          break;
        }
      }
    }

    const cert = await requestCertificate({
      profile,
      privateKey,
      publicKey,
      challenges,
    });
    stdout.write(`${await cert.data.computeFullName()}\n`);

    await keyChain.insertCert(cert);
    closeUplinks();
  }
}
