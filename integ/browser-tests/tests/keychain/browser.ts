import { EcPrivateKey, KeyChain, PrivateKey, PublicKey, theDigestKey, ValidityPeriod } from "@ndn/keychain";
import { execute as testStore } from "@ndn/keychain/test-fixture/keychain-store";
import { execute as testSignVerify } from "@ndn/keychain/test-fixture/sign-verify";
import { Data, Interest } from "@ndn/l3pkt";

import { SerializedInBrowser, serializeInBrowser } from "../../test-fixture/serialize";
import { SignVerifyTestResult } from "./api";

window.testStore = () => {
  return testStore(KeyChain.open("296616c2-7abb-4d9e-94b3-a97e4fd327b5"));
};

async function testKey(pvtA: PrivateKey, pubA: PublicKey,
                       pvtB: PrivateKey, pubB: PublicKey): Promise<SerializedInBrowser> {
  return serializeInBrowser(await Promise.all([
    testSignVerify(Interest, pvtA, pubA, pvtB, pubB),
    testSignVerify(Data, pvtA, pubA, pvtB, pubB),
  ]) as SignVerifyTestResult);
}

window.testDigestKey = () => {
  return testKey(theDigestKey, theDigestKey, theDigestKey, theDigestKey);
};

window.testEcKey = async () => {
  const keyChain = KeyChain.createTemp();
  const { privateKey: pvtA, publicKey: pubA } =
    await keyChain.generateKey(EcPrivateKey, "/EC-A", ValidityPeriod.daysFromNow(1), "P-256");
  const { privateKey: pvtB, publicKey: pubB } =
    await keyChain.generateKey(EcPrivateKey, "/EC-B", ValidityPeriod.daysFromNow(1), "P-256");
  return testKey(pvtA, pubA, pvtB, pubB);
};
