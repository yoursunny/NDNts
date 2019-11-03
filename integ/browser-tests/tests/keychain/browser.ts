import { Certificate, EC_CURVES, EcPrivateKey, KeyChain, PrivateKey, PublicKey, RSA_MODULUS_LENGTHS, RsaPrivateKey, theDigestKey } from "@ndn/keychain";
import { execute as testStore } from "@ndn/keychain/test-fixture/keychain-store";
import { execute as testSignVerify } from "@ndn/keychain/test-fixture/sign-verify";
import { Data, Interest } from "@ndn/l3pkt";

import { SerializedInBrowser, serializeInBrowser } from "../../test-fixture/serialize";
import { SignVerifyTestResult } from "./api";

async function checkBrowser() {
  const lines = [] as string[];
  const keyChain = KeyChain.open("ae688cfd-fab7-4987-93f6-3b7a2507047b");
  for (const curve of EC_CURVES) {
    try {
      const [{name}] = await EcPrivateKey.generate("/S", curve, keyChain);
      const cert = await keyChain.getCert((await keyChain.listCerts(name))[0]);
      await keyChain.deleteKey(name);
      await Certificate.getPublicKey(cert);
      lines.push(`ECDSA ${curve}: OK`);
    } catch (err) {
      lines.push(`ECDSA ${curve}: ${err}`);
    }
  }
  for (const modulusLength of RSA_MODULUS_LENGTHS) {
    try {
      const [{name}] = await RsaPrivateKey.generate("/S", modulusLength, keyChain);
      const cert = await keyChain.getCert((await keyChain.listCerts(name))[0]);
      await keyChain.deleteKey(name);
      await Certificate.getPublicKey(cert);
      lines.push(`RSA ${modulusLength}: OK`);
    } catch (err) {
      lines.push(`RSA ${modulusLength}: ${err}`);
    }
  }
  document.body.innerText = lines.join("\n");
}

window.addEventListener("load", () => {
  const btn = document.createElement("button");
  btn.innerText = "check browser";
  btn.addEventListener("click", checkBrowser);
  document.body.appendChild(btn);
});

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
  const [pvtA, pubA] = await EcPrivateKey.generate("/EC-A", "P-256");
  const [pvtB, pubB] = await EcPrivateKey.generate("/EC-B", "P-256");
  return testKey(pvtA, pubA, pvtB, pubB);
};
