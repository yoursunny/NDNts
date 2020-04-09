import { Certificate, EC_CURVES, EcPrivateKey, HmacKey, KeyChain, PrivateKey, PublicKey, RSA_MODULUS_LENGTHS, RsaPrivateKey, theDigestKey } from "@ndn/keychain";
import { Data, LLSign } from "@ndn/packet";
import { Decoder, Encoder } from "@ndn/tlv";

import { addManualTest } from "../../test-fixture/manual";

interface GenResult {
  title: string;
  err?: Error;
  pvt?: PrivateKey;
  pub?: PublicKey;
  canMakeCert?: boolean;
}

async function* genKeys(keyChain: KeyChain): AsyncGenerator<GenResult> {
  yield {
    title: "digest",
    pvt: theDigestKey,
    canMakeCert: false,
  };
  for (const curve of EC_CURVES) {
    const res: GenResult = { title: `ECDSA ${curve}` };
    try {
      [res.pvt, res.pub] = await EcPrivateKey.generate("/S", curve, keyChain);
      await keyChain.deleteKey(res.pvt.name);
    } catch (err) {
      res.err = err;
    }
    yield res;
  }
  for (const modulusLength of RSA_MODULUS_LENGTHS) {
    const res: GenResult = { title: `RSA ${modulusLength}` };
    try {
      [res.pvt, res.pub] = await RsaPrivateKey.generate("/S", modulusLength, keyChain);
      await keyChain.deleteKey(res.pvt.name);
    } catch (err) {
      res.err = err;
    }
    yield res;
  }
  {
    const res: GenResult = { title: "HMAC", canMakeCert: false };
    try {
      res.pvt = await HmacKey.generate("/S", keyChain);
      await keyChain.deleteKey(res.pvt.name);
    } catch (err) {
      res.err = err;
    }
    yield res;
  }
}

async function checkWebCrypto() {
  const lines = [] as string[];
  const keyChain = KeyChain.open("ae688cfd-fab7-4987-93f6-3b7a2507047b");
  for await (const genRes of genKeys(keyChain)) {
    let { title, err, pvt, pub, canMakeCert = true } = genRes;
    if (!err) {
      pub = pub ?? pvt as unknown as PublicKey;
      try {
        if (canMakeCert) {
          const cert = await Certificate.selfSign({ privateKey: pvt!, publicKey: pub });
          await Certificate.loadPublicKey(cert);
        }
        let pkt = new Data("/D");
        pvt!.sign(pkt);
        await pkt[LLSign.PROCESS]();
        pkt = new Decoder(Encoder.encode(pkt)).decode(Data);
        await pub.verify(pkt);
      } catch (err1) {
        err = err1;
      }
    }
    lines.push(`${title}: ${err ? err.toString() : "OK"}`);
  }
  return lines;
}

addManualTest("check WebCrypto", checkWebCrypto);
