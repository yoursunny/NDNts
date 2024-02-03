import { Certificate, EcCurve, ECDSA, generateSigningKey, type NamedSigner, type NamedVerifier, type PrivateKey, type PublicKey, RSA, RsaModulusLength } from "@ndn/keychain";
import { Name } from "@ndn/packet";
import stdout from "stdout-stream";
import type { CommandModule } from "yargs";

import { keyChain } from "./util";

const typeChoices = ["ec", "rsa", "hmac"] as const;
type TypeChoice = typeof typeChoices[number];

interface Args {
  name: Name;
  type: TypeChoice;
  curve: EcCurve;
  "modulus-length": RsaModulusLength;
}

export const GenKeyCommand: CommandModule<{}, Args> = {
  command: "gen-key <name>",
  describe: "generate key",
  aliases: ["keygen"],

  builder(argv) {
    return argv
      .positional("name", {
        coerce: Name.from,
        demandOption: true,
        desc: "subject name or key name",
        type: "string",
      })
      .option("type", {
        choices: typeChoices,
        default: typeChoices[0],
        desc: "key type",
      })
      .option("curve", {
        choices: EcCurve.Choices,
        default: EcCurve.Default,
        desc: "EC curve",
      })
      .option("modulus-length", {
        choices: RsaModulusLength.Choices,
        default: RsaModulusLength.Default,
        desc: "RSA modulus length",
      });
  },

  async handler({ name, type, curve, modulusLength }) {
    let pvt: PrivateKey;
    let pub: PublicKey;
    let canSelfSign: boolean;
    switch (type) {
      case "ec": {
        [pvt, pub] = await generateSigningKey(keyChain, name, ECDSA, { curve });
        canSelfSign = true;
        break;
      }
      case "rsa": {
        [pvt, pub] = await generateSigningKey(keyChain, name, RSA, { modulusLength });
        canSelfSign = true;
        break;
      }
      case "hmac": {
        [pvt, pub] = await generateSigningKey(keyChain, name);
        canSelfSign = false;
        break;
      }
      default: {
        throw new Error(`unknown type ${type}`);
      }
    }

    if (canSelfSign) {
      const cert = await Certificate.selfSign({
        privateKey: pvt as NamedSigner.PrivateKey,
        publicKey: pub as NamedVerifier.PublicKey,
      });
      await keyChain.insertCert(cert);
      stdout.write(`${cert.name}\n`);
    } else {
      stdout.write(`${pvt.name}\n`);
    }
  },
};
