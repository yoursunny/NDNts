import { Forwarder } from "@ndn/fw";
import { KeyChain } from "@ndn/keychain";
import { L3Face } from "@ndn/l3face";
import { Name } from "@ndn/name";
import { Client, clientLogger, makeMailsacClientEmailChallenge, schema } from "@ndn/ndncert";
import { UnixTransport } from "@ndn/node-transport";
import loudRejection from "loud-rejection";
// @ts-ignore
import readJsonSync from "read-json-sync";
import yargs from "yargs";

import * as ndnsec from "./ndnsec";

loudRejection();

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
  const face = Forwarder.getDefault().addFace(new L3Face(await UnixTransport.connect("/var/run/nfd.sock")));
  face.addRoute(new Name("/"));

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

  face.close();
})();
