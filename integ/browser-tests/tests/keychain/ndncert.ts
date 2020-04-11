import { connectToTestbed } from "@ndn/autoconfig";
import { RsaPrivateKey } from "@ndn/keychain";
import { Client, clientLogger, makeMailsacClientEmailChallenge } from "@ndn/ndncert/02";
import { Name } from "@ndn/packet";

import { addManualTest } from "../../test-fixture/manual";

clientLogger.enableAll();

async function runNdncert() {
  const [face] = await connectToTestbed({ count: 3, preferFastest: true });
  face.addRoute(new Name("/"));

  const client = await Client.gatherInfo(new Name("/ndn/edu/ucla/yufeng"));
  const challenge = await makeMailsacClientEmailChallenge();
  const probeResult = await client.probe(challenge.makeProbeRequest());

  const [privateKey, publicKey] = await RsaPrivateKey.generate(probeResult.subjectName, 2048);
  const cert = await client.request({
    privateKey,
    publicKey,
    probeResult,
    ...challenge,
  });

  return cert.name.toString();
}

addManualTest("run ndncert", runNdncert);
