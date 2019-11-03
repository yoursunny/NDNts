import { KeyLocator, SigInfo } from "@ndn/l3pkt";
import { Name } from "@ndn/name";

import { KeyName } from "../name";
import { crypto } from "../platform";
import { KeyChain } from "../store";

export interface PacketWithSignature {
  sigInfo?: SigInfo;
  sigValue?: Uint8Array;
}

export abstract class NamedKey {
  constructor(public readonly name: Name, public readonly sigType: number,
              public readonly keyLocator: KeyLocator|undefined) {
    KeyName.from(name);
  }
}

export type PvtExportSClone<E extends { kty: string }> = E & { pvt: CryptoKey };

export type PvtExport<E extends { kty: string } = { kty: string }> =
  (JsonWebKey & { kty: string }) | PvtExportSClone<E>;

type CryptoGenKeyAlgo = (EcKeyGenParams & EcKeyImportParams) |
                        (RsaHashedKeyGenParams & RsaHashedImportParams);

type CryptoGenKeyResult<E extends { kty: string }> = CryptoKeyPair & { pvtExport: PvtExport<E> };

export async function cryptoGenerateKey<P extends CryptoGenKeyAlgo, E extends { kty: string }>(
    algorithm: P, keyChain: KeyChain|undefined, pvtExportBase: E): Promise<CryptoGenKeyResult<E>> {
  const needJwk = keyChain?.canSClonePvt === false;
  const pair: CryptoKeyPair =
    await crypto.subtle.generateKey(algorithm, needJwk, ["sign", "verify"]);
  let pvtExport: PvtExport<E>;
  if (needJwk) {
    const jwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
    pair.privateKey = await crypto.subtle.importKey("jwk", jwk, algorithm, false, ["sign"]);
    pvtExport = { kty: pvtExportBase.kty, ...jwk };
  } else {
    pvtExport = { ...pvtExportBase, pvt: pair.privateKey };
  }
  return { ...pair, pvtExport };
}
