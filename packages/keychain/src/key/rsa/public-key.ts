import { Name, SigInfo, SigType } from "@ndn/packet";

import { crypto } from "../platform";
import { PublicKeyBase } from "../public-key";
import { ALGO, IMPORT_PARAMS } from "./internal";

/** RSA public key. */
export class RsaPublicKey extends PublicKeyBase {
  constructor(name: Name, public readonly key: CryptoKey) {
    super(name, SigType.Sha256WithRsa, name);
  }

  public async exportAsSpki(): Promise<Uint8Array> {
    const spki = await crypto.subtle.exportKey("spki", this.key);
    return new Uint8Array(spki);
  }

  protected doMatch(si: SigInfo): boolean {
    // TODO match KeyDigest
    return si.keyLocator instanceof Name && si.keyLocator.isPrefixOf(this.name);
  }

  protected async llVerify(input: Uint8Array, sig: Uint8Array): Promise<void> {
    const ok = await crypto.subtle.verify(ALGO, this.key, sig, input);
    PublicKeyBase.throwOnIncorrectSig(ok);
  }
}

export namespace RsaPublicKey {
  export async function importSpki(name: Name, spki: Uint8Array): Promise<RsaPublicKey> {
    const key = await crypto.subtle.importKey("spki", spki,
      IMPORT_PARAMS, true, ["verify"]);
    return new RsaPublicKey(name, key);
  }
}
