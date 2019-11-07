import { Certificate, EC_CURVES, EcCurve, EcPrivateKey, HmacKey, PrivateKey, PublicKey, RSA_MODULUS_LENGTHS, RsaModulusLength, RsaPrivateKey } from "@ndn/keychain";
import stdout from "stdout-stream";
import { Arguments, Argv, CommandModule } from "yargs";

import { CommonArgs, keyChain } from "./common-args";

type TypeChoice = "ec"|"rsa"|"hmac";
const typeChoices: ReadonlyArray<TypeChoice> = ["ec", "rsa", "hmac"];

interface Args extends CommonArgs {
  name: string;
  type: TypeChoice;
  curve: EcCurve;
  "modulus-length": RsaModulusLength;
}

async function main({
  name, type, curve, "modulus-length": modulusLength,
}: Args) {
  let pvt: PrivateKey;
  let pub: PublicKey;
  let canSelfSign = true;
  switch (type) {
    case "ec":
      [pvt, pub] = await EcPrivateKey.generate(name, curve, keyChain);
      break;
    case "rsa":
      [pvt, pub] = await RsaPrivateKey.generate(name, modulusLength, keyChain);
      break;
    case "hmac": {
      const key = await HmacKey.generate(name, keyChain);
      pvt = key;
      pub = key;
      canSelfSign = false;
      break;
    }
    default:
      /* istanbul ignore next */
      throw new Error();
  }

  if (canSelfSign) {
    const cert = await Certificate.selfSign({ privateKey: pvt, publicKey: pub });
    await keyChain.insertCert(cert);
    stdout.write(`${cert.name}\n`);
  } else {
    stdout.write(`${pvt.name}\n`);
  }
}

export class GenKeyCommand implements CommandModule<CommonArgs, Args> {
  public command = "gen-key <name>";
  public describe = "generate key";
  public aliases = ["keygen"];

  public builder(argv: Argv<CommonArgs>): Argv<Args> {
    return argv
    .positional("name", {
      desc: "subject name or key name",
      type: "string",
    })
    .demandOption("name")
    .option("type", {
      choices: typeChoices,
      default: "ec" as TypeChoice,
      desc: "key type",
    })
    .option("curve", {
      choices: EC_CURVES,
      default: "P-256" as EcCurve,
      desc: "EC curve",
    })
    .option("modulus-length", {
      choices: RSA_MODULUS_LENGTHS,
      default: 2048 as RsaModulusLength,
      desc: "RSA modulus length",
    });
  }

  public handler(args: Arguments<Args>) {
    main(args);
  }
}
