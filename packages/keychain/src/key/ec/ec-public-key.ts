import { SigInfo, SigType } from "@ndn/l3pkt";
import { Name } from "@ndn/name";

import { crypto } from "../../platform";
import { PublicKeyBase } from "../public-key";
import { EcCurve } from ".";
import { sigDerToRaw, SIGN_PARAMS } from "./internal";

/** ECDSA public key. */
export class EcPublicKey extends PublicKeyBase {
  constructor(name: Name, public readonly curve: EcCurve, private readonly key: CryptoKey) {
    super(name, SigType.Sha256WithEcdsa, name);
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
    const rawSig = sigDerToRaw(sig, this.curve);
    const ok = await crypto.subtle.verify(SIGN_PARAMS, this.key, rawSig, input);
    PublicKeyBase.throwOnIncorrectSig(ok);
  }
}
