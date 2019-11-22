import { Name, SigInfo, SigType } from "@ndn/packet";
import applyMixins from "applymixins";

import { crypto, timingSafeEqual } from "./platform/mod";
import { PrivateKeyBase } from "./private-key";
import { PublicKeyBase } from "./public-key";

export class DigestKey extends PublicKeyBase {
  constructor() {
    super(new Name("/localhost/identity/digest-sha256/KEY/digest"), SigType.Sha256, undefined);
  }

  public exportAsSpki(): Promise<Uint8Array> {
    return Promise.reject(new Error("cannot export DigestKey"));
  }

  protected async llSign(input: Uint8Array): Promise<Uint8Array> {
    const h = await crypto.subtle.digest("SHA-256", input);
    return new Uint8Array(h);
  }

  protected doMatch(si: SigInfo): boolean {
    return typeof si.keyLocator === "undefined";
  }

  protected async llVerify(input: Uint8Array, sig: Uint8Array): Promise<void> {
    const h = await crypto.subtle.digest("SHA-256", input);
    const ok = timingSafeEqual(sig, new Uint8Array(h));
    PublicKeyBase.throwOnIncorrectSig(ok);
  }
}
export interface DigestKey extends PrivateKeyBase {}
applyMixins(DigestKey, [PrivateKeyBase]);

export const theDigestKey = new DigestKey();
