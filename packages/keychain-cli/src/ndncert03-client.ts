import { closeUplinks, openUplinks } from "@ndn/cli-common";
import { type NamedSigner, type NamedVerifier, CertNaming, generateSigningKey } from "@ndn/keychain";
import { type ClientChallenge, type ClientChallengeContext, type ClientPinLikeChallenge, ClientEmailChallenge, ClientNopChallenge, ClientPinChallenge, ClientPossessionChallenge, ParameterKV, requestCertificate, requestProbe } from "@ndn/ndncert";
import { NdnsecKeyChain } from "@ndn/ndnsec";
import { Name } from "@ndn/packet";
import { toHex, toUtf8 } from "@ndn/util";
import { promises as fs } from "graceful-fs";
import prompts from "prompts";
import stdout from "stdout-stream";
import type { Arguments, Argv, CommandModule } from "yargs";

import { inputCaProfile, keyChain as defaultKeyChain } from "./util";

async function promptProbe(probeKeys: string[], email?: string): Promise<ParameterKV> {
  const questions: prompts.PromptObject[] = [];
  for (const probeKey of probeKeys) {
    questions.push({
      type: "text",
      name: probeKey,
      message: probeKey,
    });
  }

  if (email) {
    prompts.override({ email });
  }
  const response = await prompts(questions);
  prompts.override({});

  const parameters: ParameterKV = {};
  for (const probeKey of probeKeys) {
    parameters[probeKey] = toUtf8(response[probeKey]);
  }
  return parameters;
}

function promptPin(namedPipe?: string): ClientPinLikeChallenge.Prompt {
  return async ({ requestId }: ClientChallengeContext) => {
    if (namedPipe) {
      const code = await fs.readFile(namedPipe, { encoding: "utf-8" });
      prompts.override({ code });
      namedPipe = undefined;
    }
    const response = await prompts({
      type: "text",
      name: "code",
      message: `PIN for request ${toHex(requestId)}:`,
    });
    prompts.override({});
    return response.code;
  };
}

interface Args {
  profile: string;
  ndnsec: boolean;
  key?: string;
  challenge: string[];
  "pin-named-pipe"?: string;
  email?: string;
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
        desc: "use ndn-cxx KeyChain",
        default: false,
        type: "boolean",
      })
      .option("key", {
        desc: "key name or certificate name",
        defaultDescription: "run PROBE command and create new key",
        type: "string",
      })
      .option("challenge", {
        demandOption: true,
        array: true,
        choices: ["nop", "pin", "email", "possession"],
        desc: "supported challenges",
        type: "string",
      })
      .option("pin-named-pipe", {
        desc: "pin challenge - read PIN from named pipe",
        type: "string",
        hidden: true,
      })
      .option("email", {
        desc: "email challenge - email address",
        type: "string",
      })
      .option("possession-cert", {
        desc: "possession challenge - existing certificate name",
        defaultDescription: "same as --key flag when it is specified with a certificate name",
        type: "string",
      })
      .check(({ key }) => {
        if (!key) {
          return true;
        }
        const name = new Name(key);
        if (!CertNaming.isKeyName(name) && !CertNaming.isCertName(name)) {
          throw new Error("--key is not a key name or certificate name");
        }
        return true;
      })
      .check(({ challenge, email }) => {
        if (challenge.includes("email") && !email?.includes("@")) {
          throw new Error("email challenge enabled but --email is not an email address");
        }
        return true;
      })
      .check(({ challenge, key, "possession-cert": possessionCert }) => {
        // possessionCert defaults to "" so that defaultDescription is displayed, but we want to
        // use key if possessionCert is unset i.e. "", hence || operator instead of ?? operator
        if (challenge.includes("possession") &&
            !CertNaming.isCertName(new Name(possessionCert ?? key))) {
          throw new Error("possession challenge enabled but neither --key nor --possession-cert is a certificate name");
        }
        return true;
      });
  }

  public async handler(args: Arguments<Args>) {
    await openUplinks();
    const keyChain = args.ndnsec ? new NdnsecKeyChain() : defaultKeyChain;
    const profile = await inputCaProfile(args.profile);
    let privateKey: NamedSigner;
    let publicKey: NamedVerifier;
    if (args.key) {
      const keyPair = await keyChain.getKeyPair(CertNaming.toKeyName(new Name(args.key)));
      ({ signer: privateKey, verifier: publicKey } = keyPair);
    } else {
      const probeResponse = await requestProbe({
        profile,
        parameters: await promptProbe(profile.probeKeys, args.email),
      });
      if (probeResponse.entries.length === 0) {
        throw new Error(`ProbeResponse has no entries${probeResponse.redirects.length > 0 ? "; redirects exist but they are not supported" : ""}`);
      }
      [privateKey, publicKey] = await generateSigningKey(keyChain, probeResponse.entries[0]!.prefix);
      stdout.write(`${privateKey.name}\n`);
    }

    const challenges: ClientChallenge[] = [];
    for (const challengeId of args.challenge) {
      switch (challengeId) {
        case "nop":
          challenges.push(new ClientNopChallenge());
          break;
        case "pin": {
          challenges.push(new ClientPinChallenge(promptPin(args["pin-named-pipe"])));
          break;
        }
        case "email": {
          challenges.push(new ClientEmailChallenge(args.email!, promptPin(args["pin-named-pipe"])));
          break;
        }
        case "possession": {
          const certName = new Name(args["possession-cert"] ?? args.key);
          const cert = await keyChain.getCert(certName);
          const pvt = await keyChain.getKey(CertNaming.toKeyName(certName), "signer");
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
    stdout.write(`${cert.data.name}\n`);

    await keyChain.insertCert(cert);
    closeUplinks();
  }
}
