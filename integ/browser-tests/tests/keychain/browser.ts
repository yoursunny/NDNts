import { EcPrivateKey, PrivateKey, PublicKey, theDigestKey } from "@ndn/keychain";
import { execute as testSignVerify } from "@ndn/keychain/test-fixture/sign-verify";
import { Data, Interest } from "@ndn/l3pkt";

import { SerializedInBrowser, serializeInBrowser } from "../../test-fixture/serialize";

import { TestResult } from "./api";

async function testKey(pvtA: PrivateKey, pubA: PublicKey,
                       pvtB: PrivateKey, pubB: PublicKey): Promise<SerializedInBrowser> {
  return serializeInBrowser(await Promise.all([
    testSignVerify(Interest, pvtA, pubA, pvtB, pubB),
    testSignVerify(Data, pvtA, pubA, pvtB, pubB),
  ]) as TestResult);
}

window.testDigestKey = () => {
  return testKey(theDigestKey, theDigestKey, theDigestKey, theDigestKey);
};

window.testEcKey = async () => {
  const [pvtA, pubA] = await EcPrivateKey.generate("/ECKEY-A", "P-256");
  const [pvtB, pubB] = await EcPrivateKey.generate("/ECKEY-B", "P-256");
  return testKey(pvtA, pubA, pvtB, pubB);
};
