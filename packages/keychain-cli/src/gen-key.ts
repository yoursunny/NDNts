import { Certificate, EcCurve, ECDSA, generateSigningKey, type NamedSigner, type NamedVerifier, type PrivateKey, type PublicKey, RSA, RsaModulusLength } from "@ndn/keychain";
import type { NameLike } from "@ndn/packet";
import stdout from "stdout-stream";
import type { Arguments, Argv, CommandModule } from "yargs";

import { keyChain } from "./util";

const typeChoices = ["ec", "rsa", "hmac"] as const;
type TypeChoice = typeof typeChoices[number];

interface Args extends GenKeyCommand.KeyParamArgs {
  name: string;
}

export class GenKeyCommand implements CommandModule<{}, Args> {
  public readonly command = "gen-key <name>";
  public readonly describe = "generate key";
  public readonly aliases = ["keygen"];

  public builder(argv: Argv): Argv<Args> {
    return GenKeyCommand.declareKeyParamArgs(argv)
      .positional("name", {
        demandOption: true,
        desc: "subject name or key name",
        type: "string",
      });
  }

  public async handler(args: Arguments<Args>) {
    const { pvt, pub, canSelfSign } = await GenKeyCommand.generateKey(args.name, args);

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
  }
}

export namespace GenKeyCommand {
  export interface KeyParamArgs {
    type: TypeChoice;
    curve: EcCurve;
    "modulus-length": RsaModulusLength;
  }

  export function declareKeyParamArgs<T>(argv: Argv<T>): Argv<T & KeyParamArgs> {
    return argv
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
  }

  export async function generateKey(name: NameLike, {
    type, curve, "modulus-length": modulusLength,
  }: KeyParamArgs): Promise<{
        pvt: PrivateKey;
        pub: PublicKey;
        canSelfSign: boolean;
      }> {
    switch (type) {
      case "ec": {
        const [pvt, pub] = await generateSigningKey(keyChain, name, ECDSA, { curve });
        return { pvt, pub, canSelfSign: true };
      }
      case "rsa": {
        const [pvt, pub] = await generateSigningKey(keyChain, name, RSA, { modulusLength });
        return { pvt, pub, canSelfSign: true };
      }
      case "hmac": {
        const [pvt, pub] = await generateSigningKey(keyChain, name);
        return { pvt, pub, canSelfSign: false };
      }
      default: {
        throw new Error(`unknown type ${type}`);
      }
    }
  }
}
