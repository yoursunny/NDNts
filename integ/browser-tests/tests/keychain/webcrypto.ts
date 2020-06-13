import { Certificate, EC_CURVES, EcPrivateKey, HmacKey, KeyChain, PrivateKey, PublicKey, RSA_MODULUS_LENGTHS, RsaPrivateKey } from "@ndn/keychain";
import * as ndn_testbed_certs from "@ndn/keychain/test-fixture/ndn-testbed-certs";
import { Data, digestSigning, Signer, Verifier } from "@ndn/packet";
import { Decoder, Encoder } from "@ndn/tlv";

import { addManualTest } from "../../test-fixture/manual";

interface GenResult {
  title: string;
  err?: Error;
  pvt?: Signer;
  pub?: Verifier;
  canMakeCert?: boolean;
}

async function* genKeys(keyChain: KeyChain): AsyncGenerator<GenResult> {
  yield {
    title: "digest",
    pvt: digestSigning,
    canMakeCert: false,
  };
  for (const curve of EC_CURVES) {
    const res: GenResult = { title: `ECDSA ${curve}` };
    try {
      const [pvt, pub] = await EcPrivateKey.generate("/S", curve, keyChain);
      await keyChain.deleteKey(pvt.name);
      [res.pvt, res.pub] = [pvt, pub];
    } catch (err) {
      res.err = err;
    }
    yield res;
  }
  for (const modulusLength of RSA_MODULUS_LENGTHS) {
    const res: GenResult = { title: `RSA ${modulusLength}` };
    try {
      const [pvt, pub] = await RsaPrivateKey.generate("/S", modulusLength, keyChain);
      await keyChain.deleteKey(pvt.name);
      [res.pvt, res.pub] = [pvt, pub];
    } catch (err) {
      res.err = err;
    }
    yield res;
  }
  {
    const res: GenResult = { title: "HMAC", canMakeCert: false };
    try {
      const pvt = await HmacKey.generate("/S", keyChain);
      await keyChain.deleteKey(pvt.name);
      res.pvt = pvt;
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
          const cert = await Certificate.selfSign({
            publicKey: pub as PublicKey,
            privateKey: pvt as PrivateKey,
          });
          await cert.loadPublicKey();
        }
        let pkt = new Data("/D");
        await pvt!.sign(pkt);
        pkt = new Decoder(Encoder.encode(pkt)).decode(Data);
        await pub.verify(pkt);
      } catch (err_) {
        err = err_;
      }
    }
    lines.push(`${title}: ${err ? err.toString() : "OK"}`);
  }

  let testbedRootKey: PublicKey|undefined;
  try {
    const cert = Certificate.fromData(new Decoder(ndn_testbed_certs.ROOT_V2_NDNCERT).decode(Data));
    testbedRootKey = await cert.loadPublicKey();
    lines.push("import testbed root certificate: OK");
  } catch (err) {
    lines.push(`import testbed root certificate: ${err}`);
  }

  try {
    const cert = Certificate.fromData(new Decoder(ndn_testbed_certs.ARIZONA_20190312).decode(Data));
    await cert.loadPublicKey();
    await testbedRootKey?.verify(cert.data);
    lines.push("import and verify testbed site certificate: OK");
  } catch (err) {
    lines.push(`import and verify testbed site certificate: ${err}`);
  }
  return lines;
}

addManualTest("check WebCrypto", checkWebCrypto);
