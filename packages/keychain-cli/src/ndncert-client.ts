import { closeUplinks, openUplinks } from "@ndn/cli-common";
import { Certificate, PrivateKey, PublicKey } from "@ndn/keychain";
import { Client, clientLogger, makeMailsacClientEmailChallenge, schema } from "@ndn/ndncert";
import { exportKey as ndnsecExportKey, generateKey as ndnsecGenKey, installCert as ndnsecInstallCert } from "@ndn/ndnsec";
import { Name } from "@ndn/packet";
import readJsonSync from "read-json-sync";
import stdout from "stdout-stream";
import { Arguments, Argv, CommandModule } from "yargs";

import { GenKeyCommand } from "./gen-key";
import { keyChain } from "./util";

interface Args extends GenKeyCommand.KeyParamArgs {
  ca: string;
  "valid-days": number;
  ndnsec: boolean;
  verbose: boolean;
}

class KeyChainOps {
  public async generateKey(subjectName: Name, args: GenKeyCommand.KeyParamArgs): Promise<[PrivateKey, PublicKey]> {
    const { pvt, pub, canSelfSign } = await GenKeyCommand.generateKey(subjectName, args);
    if (!canSelfSign) {
      await keyChain.deleteKey(pvt.name);
      throw new Error(`cannot use ${args.type} key`);
    }
    return [pvt, pub];
  }

  public installCert(cert: Certificate): Promise<void> {
    return keyChain.insertCert(cert);
  }
}

class NdnsecKeyChainOps extends KeyChainOps {
  public async generateKey(subjectName: Name): Promise<[PrivateKey, PublicKey]> {
    const PASSPHRASE = "PASSPHRASE";
    const name = ndnsecGenKey(subjectName, { setDefault: false });
    const safeBag = ndnsecExportKey(name, PASSPHRASE);
    await safeBag.saveKeyPair(PASSPHRASE, keyChain);
    return keyChain.getKeyPair(name);
  }

  public async installCert(cert: Certificate): Promise<void> {
    await super.installCert(cert);
    ndnsecInstallCert(cert);
  }
}

async function main(args: Args) {
  const { ca, "valid-days": validDays, ndnsec: useNdnsec, verbose } = args;
  if (verbose) {
    clientLogger.enableAll();
  }
  const keyChainOps = useNdnsec ? new NdnsecKeyChainOps() : new KeyChainOps();

  const client = await Client.create(readJsonSync(ca) as schema.CaInfo);
  const challenge = await makeMailsacClientEmailChallenge();
  const probeResult = await client.probe(challenge.makeProbeRequest());

  const [privateKey, publicKey] = await keyChainOps.generateKey(probeResult.subjectName, args);
  const cert = await client.request({
    privateKey,
    publicKey,
    probeResult,
    validityPeriod: validDays,
    ...challenge,
  });
  await keyChainOps.installCert(cert);
  stdout.write(`${cert.name}\n`);
}

export class NdncertClientCommand implements CommandModule<{}, Args> {
  public command = "ndncert-client";
  public describe = "request certificate using NDNCERT protocol";

  public builder(argv: Argv): Argv<Args> {
    return GenKeyCommand.declareKeyParamArgs(argv)
      .option("ca", {
        demandOption: true,
        desc: "CA config file",
        type: "string",
      })
      .option("valid-days", {
        default: 30,
        desc: "validity period in days since now",
        type: "number",
      })
      .option("ndnsec", {
        default: false,
        desc: "save key and certificate in ndn-cxx KeyChain",
        type: "boolean",
      })
      .option("verbose", {
        default: false,
        desc: "enable NDNCERT client logging",
        type: "boolean",
      });
  }

  public handler(args: Arguments<Args>) {
    openUplinks()
      .then(() => main(args))
      .finally(closeUplinks);
  }
}
