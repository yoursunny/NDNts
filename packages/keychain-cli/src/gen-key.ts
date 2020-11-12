import { Certificate, EcCurve, ECDSA, generateSigningKey, NamedSigner, NamedVerifier, PrivateKey, PublicKey, RSA, RsaModulusLength } from "@ndn/keychain";
import { NameLike } from "@ndn/packet";
import stdout from "stdout-stream";
import type { Arguments, Argv, CommandModule } from "yargs";

import { keyChain } from "./util";

type TypeChoice = "ec"|"rsa"|"hmac";
const typeChoices: readonly TypeChoice[] = ["ec", "rsa", "hmac"];

interface Args extends GenKeyCommand.KeyParamArgs {
  name: string;
}

export class GenKeyCommand implements CommandModule<{}, Args> {
  public command = "gen-key <name>";
  public describe = "generate key";
  public aliases = ["keygen"];

  public builder(argv: Argv): Argv<Args> {
    return GenKeyCommand.declareKeyParamArgs(argv)
      .positional("name", {
        desc: "subject name or key name",
        type: "string",
      })
      .demandOption("name");
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
        default: "ec" as TypeChoice,
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
      default:
        /* istanbul ignore next */
        throw new Error(`unknown type ${type}`);
    }
  }
}
