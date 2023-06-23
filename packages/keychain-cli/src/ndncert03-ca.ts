import { openUplinks } from "@ndn/cli-common";
import { createVerifier, SigningAlgorithmListFull } from "@ndn/keychain";
import { Server, type ServerChallenge, ServerEmailChallenge, ServerNopChallenge, ServerPinChallenge, ServerPossessionChallenge } from "@ndn/ndncert";
import type { Verifier } from "@ndn/packet";
import { DataStore, PrefixRegShorter, RepoProducer } from "@ndn/repo";
import { toHex } from "@ndn/util";
import { makeEnv, parsers } from "@strattadb/environment";
import leveldown from "leveldown";
import { createTransport as createMT } from "nodemailer";
import stdout from "stdout-stream";
import type { CommandModule } from "yargs";

import { inputCaProfile, inputCertBase64, keyChain } from "./util";

interface Args {
  profile: string;
  store: string;
  challenge: readonly string[];
  "possession-issuer"?: string;
}

export const Ndncert03CaCommand: CommandModule<{}, Args> = {
  command: "ndncert03-ca",
  describe: "run NDNCERT 0.3 certificate authority",

  builder(argv) {
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
        choices: ["nop", "pin", "email", "possession"],
        desc: "supported challenges",
        type: "string",
      })
      .option("possession-issuer", {
        desc: "possession challenge - existing issuer certificate file",
        defaultDescription: "CA certificate",
        type: "string",
      });
  },

  async handler(args) {
    await openUplinks();

    const profile = await inputCaProfile(args.profile, true);
    const signer = await keyChain.getSigner(profile.cert.name);

    const repo = new DataStore(leveldown(args.store));
    RepoProducer.create(repo, { reg: PrefixRegShorter(2) });

    const challenges: ServerChallenge[] = [];
    for (const challengeId of args.challenge) {
      switch (challengeId) {
        case "nop": {
          challenges.push(new ServerNopChallenge());
          break;
        }
        case "pin": {
          const challenge = new ServerPinChallenge();
          challenge.on("newpin", (requestId, pin) => {
            stdout.write(`PinChallenge requestId=${toHex(requestId)} pin=${pin}\n`);
          });
          challenges.push(challenge);
          break;
        }
        case "email": {
          const env = makeEnv({
            host: {
              envVarName: "CA_EMAIL_HOST",
              parser: parsers.string,
              required: true,
            },
            port: {
              envVarName: "CA_EMAIL_PORT",
              parser: parsers.port,
              required: false,
              defaultValue: 587,
            },
            user: {
              envVarName: "CA_EMAIL_USER",
              parser: parsers.string,
              required: true,
            },
            pass: {
              envVarName: "CA_EMAIL_PASS",
              parser: parsers.string,
              required: true,
            },
            from: {
              envVarName: "CA_EMAIL_FROM",
              parser: parsers.email,
              required: true,
            },
          });
          const challenge = new ServerEmailChallenge({
            mail: createMT({
              host: env.host,
              port: env.port,
              secure: env.port === 465,
              auth: {
                user: env.user,
                pass: env.pass,
              },
            }),
            template: {
              from: env.from,
              subject: "NDNCERT email challenge",
              text: `Hi there

Someone has requested a Named Data Networking certificate from an NDNCERT certificate authority.

Requested subject name: $subjectName$
Requested key name: $keyName$
Certificate authority name: $caPrefix$
Request ID: $requestId$

If this is you, please validate the above information, and enter the following PIN code:
    $pin$

Otherwise, please disregard this message.`,
            },
          });
          challenge.on("emailsent", (requestId, sent) => {
            stdout.write(`EmailChallenge requestId=${toHex(requestId)} sent=${JSON.stringify(sent)}\n`);
          });
          challenge.on("emailerror", (requestId, err) => {
            stdout.write(`EmailChallenge requestId=${toHex(requestId)} err=${err}\n`);
          });
          challenges.push(challenge);
          break;
        }
        case "possession": {
          let verifier: Verifier;
          if (args.possessionIssuer) {
            const issuerCert = await inputCertBase64(args.possessionIssuer);
            verifier = await createVerifier(issuerCert, { algoList: SigningAlgorithmListFull });
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
      signer,
      challenges,
    });
    await new Promise(() => undefined);
  },
};
