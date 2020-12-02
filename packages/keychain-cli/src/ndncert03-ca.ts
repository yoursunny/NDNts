import { openUplinks } from "@ndn/cli-common";
import { CertNaming } from "@ndn/keychain";
import { Server, ServerChallenge, ServerNopChallenge, ServerPinChallenge, ServerPossessionChallenge } from "@ndn/ndncert";
import type { Verifier } from "@ndn/packet";
import { DataStore, PrefixRegShorter, RepoProducer } from "@ndn/repo";
import { toHex } from "@ndn/tlv";
import leveldown from "leveldown";
import stdout from "stdout-stream";
import type { Arguments, Argv, CommandModule } from "yargs";

import { inputCaProfile, inputCertBase64, keyChain } from "./util";

interface Args {
  profile: string;
  store: string;
  challenge: string[];
  "possession-issuer"?: string;
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
        choices: ["nop", "pin", "possession"],
        desc: "supported challenges",
        type: "string",
      })
      .option("possession-issuer", {
        desc: "possession challenge - filename of existing certificate issuer",
        type: "string",
      });
  }

  public async handler(args: Arguments<Args>) {
    await openUplinks();

    const profile = await inputCaProfile(args.profile);
    const key = await keyChain.getKey(CertNaming.toKeyName(profile.cert.name), "signer");

    const repo = new DataStore(leveldown(args.store));
    RepoProducer.create(repo, { reg: PrefixRegShorter(2) });

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
        case "possession": {
          const { "possession-issuer": issuerFile } = args;
          let verifier: Verifier;
          if (issuerFile) {
            const issuerCert = await inputCertBase64(issuerFile);
            verifier = await issuerCert.createVerifier();
          } else {
            verifier = profile.publicKey;
          }
          challenges.push(new ServerPossessionChallenge(verifier));
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
