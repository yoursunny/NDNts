import { KeyChain } from "@ndn/keychain";
import { digestSigning, Name, Signer } from "@ndn/packet";

import { env } from "./env";

let theKeyChain: KeyChain|undefined;

export function openKeyChain(): KeyChain {
  if (!theKeyChain) {
    if (env.keychain) {
      theKeyChain = KeyChain.open(env.keychain);
    } else {
      theKeyChain = KeyChain.createTemp();
    }
  }
  return theKeyChain;
}

export async function getSignerImpl(prefix: Name|undefined): Promise<Signer> {
  const keyChain = openKeyChain();
  const keys = await keyChain.listKeys(prefix);
  if (keys.length > 0) {
    return keyChain.getPrivateKey(keys[0]);
  }
  return digestSigning;
}

export async function getSigner(): Promise<Signer> {
  return getSignerImpl(env.key);
}
