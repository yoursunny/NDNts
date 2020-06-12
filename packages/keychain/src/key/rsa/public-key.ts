import { Name, SigType, Verifier } from "@ndn/packet";

import { PublicKey } from "../base";
import { crypto } from "../platform/mod";
import { ALGO, IMPORT_PARAMS } from "./algo";

/** RSA public key. */
export class RsaPublicKey extends PublicKey implements PublicKey.Exportable {
  constructor(name: Name, public readonly key: CryptoKey) {
    super(name, SigType.Sha256WithRsa);
  }

  protected async llVerify(input: Uint8Array, sig: Uint8Array): Promise<void> {
    const ok = await crypto.subtle.verify(ALGO, this.key, sig, input);
    Verifier.throwOnBadSig(ok);
  }

  public async exportAsSpki(): Promise<Uint8Array> {
    const spki = await crypto.subtle.exportKey("spki", this.key);
    return new Uint8Array(spki);
  }
}

export namespace RsaPublicKey {
  export async function importSpki(name: Name, spki: Uint8Array): Promise<RsaPublicKey> {
    const key = await crypto.subtle.importKey("spki", spki,
      IMPORT_PARAMS, true, ["verify"]);
    return new RsaPublicKey(name, key);
  }
}
