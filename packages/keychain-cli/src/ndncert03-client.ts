import { closeUplinks, openUplinks } from "@ndn/cli-common";
import { CertNaming } from "@ndn/keychain";
import { ClientChallenge, ClientChallengeContext, ClientNopChallenge, ClientPinChallenge, ClientPossessionChallenge, requestCertificate } from "@ndn/ndncert";
import { NdnsecKeyChain } from "@ndn/ndnsec";
import { Name } from "@ndn/packet";
import { toHex } from "@ndn/tlv";
import prompts from "prompts";
import stdout from "stdout-stream";
import type { Arguments, Argv, CommandModule } from "yargs";

import { inputCaProfile, keyChain as defaultKeyChain } from "./util";

async function promptPin({ requestId }: ClientChallengeContext): Promise<string> {
  const response = await prompts({
    type: "text",
    name: "code",
    message: `PIN for request ${toHex(requestId)}:`,
  });
  return response.code;
}

interface Args {
  profile: string;
  ndnsec: boolean;
  key: string;
  challenge: string[];
  "possession-cert"?: string;
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
        choices: ["nop", "pin", "possession"],
        desc: "supported challenges",
        type: "string",
      })
      .option("possession-cert", {
        desc: "possession challenge - existing certificate name",
        type: "string",
      })
      .check(({ key }) => {
        if (!CertNaming.isKeyName(new Name(key))) {
          throw new Error("--key is not a key name");
        }
        return true;
      })
      .check(({ challenge, "possession-cert": possessionCert }) => {
        if (challenge.includes("possession") && !CertNaming.isCertName(new Name(possessionCert))) {
          throw new Error("--possession-cert is not a certificate name");
        }
        return true;
      });
  }

  public async handler(args: Arguments<Args>) {
    await openUplinks();
    const keyChain = args.ndnsec ? new NdnsecKeyChain() : defaultKeyChain;
    const profile = await inputCaProfile(args.profile);
    const { signer: privateKey, verifier: publicKey } = await keyChain.getKeyPair(new Name(args.key));

    const challenges: ClientChallenge[] = [];
    for (const challengeId of args.challenge) {
      switch (challengeId) {
        case "nop":
          challenges.push(new ClientNopChallenge());
          break;
        case "pin": {
          challenges.push(new ClientPinChallenge(promptPin));
          break;
        }
        case "possession": {
          const certName = new Name(args["possession-cert"]);
          const cert = await keyChain.getCert(certName);
          const keyName = CertNaming.toKeyName(certName);
          const pvt = await keyChain.getKey(keyName, "signer");
          challenges.push(new ClientPossessionChallenge(cert, pvt));
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
