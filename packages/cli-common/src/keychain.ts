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

export async function getSignerImpl(prefix = new Name(), useKeyNameKeyLocator = false): Promise<Signer> {
  const keyChain = openKeyChain();
  return keyChain.getSigner(prefix, {
    prefixMatch: true,
    fallback: digestSigning,
    useKeyNameKeyLocator,
  });
}

export async function getSigner(): Promise<Signer> {
  return getSignerImpl(env.key);
}
