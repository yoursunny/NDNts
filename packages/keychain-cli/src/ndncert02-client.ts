import { closeUplinks, openUplinks } from "@ndn/cli-common";
import { Client, clientLogger, makeMailsacClientEmailChallenge, schema } from "@ndn/ndncert/02";
import { NdnsecKeyChain } from "@ndn/ndnsec";
import readJsonSync from "read-json-sync";
import stdout from "stdout-stream";
import { Arguments, Argv, CommandModule } from "yargs";

import { GenKeyCommand } from "./gen-key";
import { keyChain as defaultKeyChain } from "./util";

interface Args extends GenKeyCommand.KeyParamArgs {
  ca: string;
  "valid-days": number;
  ndnsec: boolean;
  verbose: boolean;
}

async function main(args: Args) {
  const { ca, "valid-days": validDays, ndnsec: useNdnsec, verbose } = args;
  if (verbose) {
    clientLogger.enableAll();
  }
  const keyChain = useNdnsec ? new NdnsecKeyChain() : defaultKeyChain;

  const client = await Client.create(readJsonSync(ca) as schema.CaInfo);
  const challenge = await makeMailsacClientEmailChallenge();
  const probeResult = await client.probe(challenge.makeProbeRequest());

  const { pvt, pub, canSelfSign } = await GenKeyCommand.generateKey(probeResult.subjectName, args);
  if (!canSelfSign) {
    await keyChain.deleteKey(pvt.name);
    throw new Error(`cannot use ${args.type} key`);
  }

  const cert = await client.request({
    privateKey: pvt,
    publicKey: pub,
    probeResult,
    validityPeriod: validDays,
    ...challenge,
  });
  await keyChain.insertCert(cert);
  stdout.write(`${cert.name}\n`);
}

export class Ndncert02ClientCommand implements CommandModule<{}, Args> {
  public command = "ndncert02-client";
  public describe = "request certificate using NDNCERT 0.2 protocol";

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
