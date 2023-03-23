import { CryptoAlgorithmListFull, KeyChain } from "@ndn/keychain";
import { Data, digestSigning, Name, type Signer } from "@ndn/packet";

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

export async function getSignerImpl(prefix = new Name()): Promise<[signer: Signer, klName?: Name]> {
  const keyChain = openKeyChain();
  const signer = await keyChain.getSigner(prefix, {
    prefixMatch: true,
    fallback: digestSigning,
  });

  let klName = (signer as { name?: Name }).name;
  if (!(klName instanceof Name)) {
    try {
      const data = new Data("/klName");
      await signer.sign(data);
      klName = data.sigInfo.keyLocator?.name;
    } catch {}
  }
  return [signer, klName];
}

/** Get the KeyChain signer specified by NDNTS_KEY environ. */
export async function getSigner(): Promise<Signer> {
  const [signer] = await getSignerImpl(env.key);
  return signer;
}
