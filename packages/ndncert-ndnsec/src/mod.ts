import { closeUplinks, openUplinks } from "@ndn/cli-common";
import { KeyChain } from "@ndn/keychain";
import { Client, clientLogger, makeMailsacClientEmailChallenge, schema } from "@ndn/ndncert";
// @ts-ignore
import readJsonSync from "read-json-sync";
import yargs from "yargs";

import * as ndnsec from "./ndnsec";

const args = yargs
.scriptName("ndncert-ndnsec")
.option("ca", {
  demandOption: true,
  desc: "CA config file",
  type: "string",
})
.option("validity", {
  default: 30,
  desc: "validity period in days",
  type: "number",
})
.option("verbose", {
  default: false,
  desc: "enable logging",
  type: "boolean",
})
.parse();
if (args.verbose) {
  clientLogger.enableAll();
}
const caInfo = readJsonSync(args.ca) as schema.CaInfo;

(async function() {
  await openUplinks();

  const challenge = await makeMailsacClientEmailChallenge();
  const client = await Client.create(caInfo);
  const probeResult = await client.probe(challenge.makeProbeRequest());

  const keyChain = KeyChain.createTemp();
  const keyName = await ndnsec.makeKey(probeResult.subjectName);
  await ndnsec.importKey(keyName, keyChain);
  const [privateKey, publicKey] = await keyChain.getKeyPair(keyName);

  const cert = await client.request({
    privateKey,
    publicKey,
    probeResult,
    validityPeriod: args.validity,
    ...challenge,
  });
  await ndnsec.installCert(cert);
})().finally(closeUplinks);
