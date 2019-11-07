import { Certificate, EcPrivateKey, EcPublicKey, KeyChain, RsaPrivateKey, RsaPublicKey, saveKey } from "@ndn/keychain";
import { SigType } from "@ndn/l3pkt";
import { Name } from "@ndn/name";

/**
 * Import public key from certificate and private key from PKCS8.
 * This does not import certificate.
 */
export async function importKeyPair(cert: Certificate, pkcs8: Uint8Array, keyChain: KeyChain): Promise<Name> {
  const pub = await Certificate.loadPublicKey(cert);
  switch (pub.sigType) {
    case SigType.Sha256WithEcdsa:
      return importEcKeyPair(pub as EcPublicKey, pkcs8, keyChain);
    case SigType.Sha256WithRsa:
      return importRsaKeyPair(pub as RsaPublicKey, pkcs8, keyChain);
    default:
      /* istanbul ignore next */
      throw new Error(`unknown SigType ${pub.sigType}`);
  }
}

async function importEcKeyPair(pub: EcPublicKey, pkcs8: Uint8Array, keyChain: KeyChain): Promise<Name> {
  const { name, curve } = pub;
  const params = EcPrivateKey.makeWebCryptoImportParams(curve);
  await saveKey(name, EcPrivateKey.makeStoredKeyBase(curve), params, keyChain,
    async (extractable, crypto) => {
      return {
        privateKey: await crypto.subtle.importKey("pkcs8", pkcs8, params, extractable, ["sign"]),
        publicKey: pub.key,
      } as CryptoKeyPair;
    });
  return name;
}

async function importRsaKeyPair(pub: RsaPublicKey, pkcs8: Uint8Array, keyChain: KeyChain): Promise<Name> {
  const { name } = pub;
  const params = RsaPrivateKey.makeWebCryptoImportParams();
  await saveKey(name, RsaPrivateKey.makeStoredKeyBase(), params, keyChain,
    async (extractable, crypto) => {
      return {
        privateKey: await crypto.subtle.importKey("pkcs8", pkcs8, params, extractable, ["sign"]),
        publicKey: pub.key,
      } as CryptoKeyPair;
    });
  return name;
}
