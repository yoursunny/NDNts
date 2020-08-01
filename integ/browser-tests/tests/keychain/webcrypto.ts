import { Certificate, EcCurve, ECDSA, generateSigningKey, HMAC, KeyChain, NamedSigner, NamedVerifier, RSA, RsaModulusLength } from "@ndn/keychain";
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
    pub: digestSigning,
    canMakeCert: false,
  };
  for (const curve of EcCurve.Choices) {
    const res: GenResult = { title: `ECDSA ${curve}` };
    try {
      const [pvt, pub] = await generateSigningKey(keyChain, "/S", ECDSA, { curve });
      await keyChain.deleteKey(pvt.name);
      [res.pvt, res.pub] = [pvt, pub];
    } catch (err) {
      res.err = err;
    }
    yield res;
  }
  for (const modulusLength of RsaModulusLength.Choices) {
    const res: GenResult = { title: `RSA ${modulusLength}` };
    try {
      const [pvt, pub] = await generateSigningKey(keyChain, "/S", RSA, { modulusLength });
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
      const [pvt, pub] = await generateSigningKey(keyChain, "/S", HMAC);
      await keyChain.deleteKey(pvt.name);
      [res.pvt, res.pub] = [pvt, pub];
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
    if (pvt && pub) {
      try {
        if (canMakeCert) {
          const cert = await Certificate.selfSign({
            publicKey: pub as NamedVerifier.PublicKey,
            privateKey: pvt as NamedSigner.PrivateKey,
          });
          await cert.createVerifier();
        }
        let pkt = new Data("/D");
        await pvt.sign(pkt);
        pkt = new Decoder(Encoder.encode(pkt)).decode(Data);
        await pub.verify(pkt);
      } catch (err_) {
        err = err_;
      }
    }
    lines.push(`${title}: ${err ? err.toString() : "OK"}`);
  }

  let testbedRootKey: NamedVerifier.PublicKey|undefined;
  try {
    const cert = Certificate.fromData(new Decoder(ndn_testbed_certs.ROOT_V2_NDNCERT).decode(Data));
    testbedRootKey = await cert.createVerifier();
    lines.push("import testbed root certificate: OK");
  } catch (err) {
    lines.push(`import testbed root certificate: ${err}`);
  }

  try {
    const cert = Certificate.fromData(new Decoder(ndn_testbed_certs.ARIZONA_20190312).decode(Data));
    await cert.createVerifier();
    await testbedRootKey?.verify(cert.data);
    lines.push("import and verify testbed site certificate: OK");
  } catch (err) {
    lines.push(`import and verify testbed site certificate: ${err}`);
  }
  return lines;
}

addManualTest("check WebCrypto", checkWebCrypto);
