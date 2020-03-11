import { KeyChain, PrivateKey, theDigestKey } from "@ndn/keychain";
import { Name } from "@ndn/packet";

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

export async function getSignerImpl(prefix: Name|undefined): Promise<PrivateKey> {
  const keyChain = openKeyChain();
  const keys = await keyChain.listKeys(prefix);
  if (keys.length > 0) {
    return keyChain.getPrivateKey(keys[0]);
  }
  return theDigestKey;
}

export async function getSigner(): Promise<PrivateKey> {
  return getSignerImpl(env.key);
}
