import fs from "node:fs/promises";

import { openUplinks } from "@ndn/cli-common";
import { CertNaming, generateSigningKey, type KeyChain, type NamedSigner, type NamedVerifier } from "@ndn/keychain";
import { AltUri } from "@ndn/naming-convention2";
import { type CaProfile, type ClientChallenge, type ClientChallengeContext, ClientEmailChallenge, ClientEmailInboxImap, ClientNopChallenge, ClientPinChallenge, type ClientPinLikeChallenge, ClientPossessionChallenge, matchProbe, requestCertificate, requestProbe } from "@ndn/ndncert";
import { NdnsecKeyChain } from "@ndn/ndnsec";
import { Name } from "@ndn/packet";
import { console, toHex } from "@ndn/util";
import prompts from "prompts";
import stdout from "stdout-stream";
import type { CommandModule } from "yargs";

import { inputCaProfile, keyChain as defaultKeyChain, PPOption, promptProbeParameters } from "./util";

interface Args {
  profile: string;
  ndnsec: boolean;
  key?: string;
  pp: PPOption;
  challenge: readonly string[];
  "pin-named-pipe"?: string;
  email?: string;
  "possession-cert"?: string;
}

export const Ndncert03ClientCommand: CommandModule<{}, Args> = {
  command: "ndncert03-client",
  describe: "request certificate via NDNCERT 0.3",

  builder(argv) {
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
      .option("pp", PPOption.def)
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
          throw new Error("--key is neither a key name nor a certificate name");
        }
        return true;
      })
      .check(({ challenge, email }) => {
        if (challenge.includes("email") && !(email === "ethereal" || email?.includes("@"))) {
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
  },

  async handler(args) {
    await openUplinks();
    await new InteractiveClient(args).run();
  },
};

class InteractiveClient {
  constructor(private readonly args: Args) {}

  private keyChain!: KeyChain;
  private profile!: CaProfile;
  private privateKey!: NamedSigner.PrivateKey;
  private publicKey!: NamedVerifier.PublicKey;
  private inbox?: ClientEmailInboxImap;

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
    await this.inbox?.close();

    await this.keyChain.insertCert(cert);
  }

  private async prepareKeyPair() {
    if (this.args.key) {
      return this.retrieveKeyPairFromKeyChain(CertNaming.toKeyName(new Name(this.args.key)));
    }

    const { pp, email } = this.args;
    const known = [...(pp as string[])];
    if (email?.includes("@")) {
      known.unshift("email", email);
    }
    const parameters = await promptProbeParameters(this.profile, known);
    const probeResponse = await requestProbe({
      profile: this.profile,
      parameters,
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

  private async prepareChallenges(): Promise<ClientChallenge[]> {
    const challenges: ClientChallenge[] = [];
    for (const challengeId of this.args.challenge) {
      switch (challengeId) {
        case "nop": {
          challenges.push(new ClientNopChallenge());
          break;
        }
        case "pin": {
          challenges.push(new ClientPinChallenge(this.promptPin()));
          break;
        }
        case "email": {
          if (this.args.email === "ethereal") {
            this.inbox = await ClientEmailInboxImap.createEthereal();
            console.log(`Using Ethereal Email inbox ${this.inbox.address}`);
            challenges.push(new ClientEmailChallenge(this.inbox.address, this.inbox.promptCallback));
          } else {
            challenges.push(new ClientEmailChallenge(this.args.email!, this.promptPin()));
          }
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
        const code = await fs.readFile(namedPipe, "utf8");
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
