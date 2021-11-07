import { CryptoAlgorithmListFull, KeyChain } from "@ndn/keychain";
import { digestSigning, Name, Signer } from "@ndn/packet";

import { env } from "./env";

let theKeyChain: KeyChain | undefined;

/** Open the KeyChain specified by NDNTS_KEYCHAIN environ. */
export function openKeyChain(): KeyChain {
  if (!theKeyChain) {
    if (env.keychain) {
      theKeyChain = KeyChain.open(env.keychain, CryptoAlgorithmListFull);
    } else {
      theKeyChain = KeyChain.createTemp(CryptoAlgorithmListFull);
    }
  }
  return theKeyChain;
}

export async function getSignerImpl(prefix = new Name()): Promise<Signer> {
  const keyChain = openKeyChain();
  return keyChain.getSigner(prefix, {
    prefixMatch: true,
    fallback: digestSigning,
  });
}

/** Get the KeyChain signer specified by NDNTS_KEY environ. */
export async function getSigner(): Promise<Signer> {
  return getSignerImpl(env.key);
}
