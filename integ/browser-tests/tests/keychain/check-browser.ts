import { Certificate, EC_CURVES, EcPrivateKey, KeyChain, PrivateKey, PublicKey, RSA_MODULUS_LENGTHS, RsaPrivateKey } from "@ndn/keychain";

interface GenResult {
  title: string;
  err?: Error;
  pvt?: PrivateKey;
  pub?: PublicKey;
}

async function* genKeys(keyChain: KeyChain): AsyncGenerator<GenResult> {
  for (const curve of EC_CURVES) {
    const res = { title: `ECDSA ${curve}` } as GenResult;
    try {
      [res.pvt, res.pub] = await EcPrivateKey.generate("/S", curve, keyChain);
      await keyChain.deleteKey(res.pvt.name);
    } catch (err) {
      res.err = err;
    }
    yield res;
  }
  for (const modulusLength of RSA_MODULUS_LENGTHS) {
    const res = { title: `RSA ${modulusLength}` } as GenResult;
    try {
      [res.pvt, res.pub] = await RsaPrivateKey.generate("/S", modulusLength, keyChain);
      await keyChain.deleteKey(res.pvt.name);
    } catch (err) {
      res.err = err;
    }
    yield res;
  }
}

export async function checkBrowser() {
  const lines = [] as string[];
  const keyChain = KeyChain.open("ae688cfd-fab7-4987-93f6-3b7a2507047b");
  for await (const genRes of genKeys(keyChain)) {
    const { title, pvt, pub } = genRes;
    let { err } = genRes;
    if (!err) {
      try {
        const cert = await Certificate.selfSign({ privateKey: pvt!, publicKey: pub! });
        await Certificate.loadPublicKey(cert);
      } catch (err1) {
        err = err1;
      }
    }
    lines.push(`${title}: ${err ? err : "OK"}`);
  }
  document.body.innerText = lines.join("\n");
}

window.addEventListener("load", () => {
  const btn = document.createElement("button");
  btn.innerText = "check browser";
  btn.addEventListener("click", checkBrowser);
  document.body.appendChild(btn);
});
