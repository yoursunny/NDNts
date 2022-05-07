import { closeUplinks, openUplinks } from "@ndn/cli-common";
import { type KeyChain, type NamedSigner, type NamedVerifier, CertNaming, generateSigningKey } from "@ndn/keychain";
import { AltUri } from "@ndn/naming-convention2";
import { type CaProfile, type ClientChallenge, type ClientChallengeContext, type ClientPinLikeChallenge, ClientEmailChallenge, ClientNopChallenge, ClientPinChallenge, ClientPossessionChallenge, matchProbe, ParameterKV, requestCertificate, requestProbe } from "@ndn/ndncert";
import { NdnsecKeyChain } from "@ndn/ndnsec";
import { Name } from "@ndn/packet";
import { console, toHex, toUtf8 } from "@ndn/util";
import { promises as fs } from "graceful-fs";
import prompts from "prompts";
import stdout from "stdout-stream";
import type { Arguments, Argv, CommandModule } from "yargs";

import { inputCaProfile, keyChain as defaultKeyChain } from "./util";

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
        defaultDescription: "same as --key when it is a certificate name",
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
        if (challenge.includes("possession") &&
            !CertNaming.isCertName(new Name(possessionCert ?? key))) {
          throw new Error("possession challenge enabled but neither --key nor --possession-cert is a certificate name");
        }
        return true;
      });
  }

  public async handler(args: Arguments<Args>) {
    await openUplinks();
    try {
      await new InteractiveClient(args).run();
    } finally {
      closeUplinks();
    }
  }
}

class InteractiveClient {
  constructor(private readonly args: Args) {}

  private keyChain!: KeyChain;
  private profile!: CaProfile;
  private privateKey!: NamedSigner.PrivateKey;
  private publicKey!: NamedVerifier.PublicKey;

  public async run(): Promise<void> {
    this.keyChain = this.args.ndnsec ? new NdnsecKeyChain() : defaultKeyChain;
    this.profile = await inputCaProfile(this.args.profile);

    await this.prepareKeyPair();
    const challenges = await this.prepareChallenges();

    const cert = await requestCertificate({
      profile: this.profile,
      privateKey: this.privateKey,
      publicKey: this.publicKey,
      challenges,
    });
    stdout.write(`${cert.data.name}\n`);

    await this.keyChain.insertCert(cert);
  }

  private async prepareKeyPair() {
    if (this.args.key) {
      return this.retrieveKeyPairFromKeyChain(CertNaming.toKeyName(new Name(this.args.key)));
    }

    const probeResponse = await requestProbe({
      profile: this.profile,
      parameters: await this.promptProbe(),
    });

    for (const keyName of await this.keyChain.listKeys()) {
      if (matchProbe(probeResponse, keyName)) {
        console.log(`Using existing key ${keyName}`);
        return this.retrieveKeyPairFromKeyChain(keyName);
      }
    }

    if (probeResponse.entries.length === 0) {
      throw new Error(`ProbeResponse has no entries${probeResponse.redirects.length > 0 ? "; redirects exist but they are not supported" : ""}`);
    }

    const { prefix } = probeResponse.entries[0]!;
    console.log(`Generating new key ${prefix}`);
    [this.privateKey, this.publicKey] = await generateSigningKey(this.keyChain, prefix);
  }

  private async retrieveKeyPairFromKeyChain(keyName: Name) {
    const keyPair = await this.keyChain.getKeyPair(keyName);
    this.privateKey = keyPair.signer;
    this.publicKey = keyPair.verifier;
  }

  private async promptProbe(): Promise<ParameterKV> {
    const questions: prompts.PromptObject[] = [];
    for (const probeKey of this.profile.probeKeys) {
      questions.push({
        type: "text",
        name: probeKey,
        message: `Probe parameter ${probeKey}`,
      });
    }

    if (this.args.email) {
      prompts.override({ email: this.args.email });
    }
    const response = await prompts(questions);
    prompts.override({});

    const parameters: ParameterKV = {};
    for (const probeKey of this.profile.probeKeys) {
      parameters[probeKey] = toUtf8(response[probeKey]);
    }
    return parameters;
  }

  private async prepareChallenges(): Promise<ClientChallenge[]> {
    const challenges: ClientChallenge[] = [];
    for (const challengeId of this.args.challenge) {
      switch (challengeId) {
        case "nop":
          challenges.push(new ClientNopChallenge());
          break;
        case "pin": {
          challenges.push(new ClientPinChallenge(this.promptPin()));
          break;
        }
        case "email": {
          challenges.push(new ClientEmailChallenge(this.args.email!, this.promptPin()));
          break;
        }
        case "possession": {
          const certName = new Name(this.args["possession-cert"] ?? this.args.key);
          const cert = await this.keyChain.getCert(certName);
          const pvt = await this.keyChain.getKey(CertNaming.toKeyName(certName), "signer");
          challenges.push(new ClientPossessionChallenge(cert, pvt));
          break;
        }
      }
    }
    return challenges;
  }

  private promptPin(): ClientPinLikeChallenge.Prompt {
    const namedPipe = this.args["pin-named-pipe"];
    return async ({ requestId, certRequestName }: ClientChallengeContext) => {
      if (namedPipe) {
        const code = await fs.readFile(namedPipe, { encoding: "utf-8" });
        prompts.override({ code });
      } else {
        console.log(`\nPIN entry for certificate request\n${
          certRequestName}\n${AltUri.ofName(certRequestName)}`);
      }
      const response = await prompts({
        type: "text",
        name: "code",
        message: `PIN for request ${toHex(requestId)}:`,
      }, {
        onCancel: () => { throw new Error("PIN not entered"); },
      });
      prompts.override({});
      return String(response.code).trim();
    };
  }
}
