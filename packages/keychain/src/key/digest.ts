import { SigInfo, SigType } from "@ndn/l3pkt";
import { Name } from "@ndn/name";
import applyMixins from "applymixins";

import { crypto, timingSafeEqual } from "../platform";
import { PrivateKeyBase, PublicKeyBase } from "./internal";
import { PrivateKey } from "./key";

const IDENTITY = new Name("/localhost/identity/digest-sha256");

export class DigestKey extends PublicKeyBase implements PrivateKey {
  constructor() {
    super(IDENTITY, SigType.Sha256, undefined);
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
// tslint:disable-next-line no-empty-interface
export interface DigestKey extends PrivateKeyBase {}
applyMixins(DigestKey, [PrivateKeyBase]);

export const theDigestKey = new DigestKey();
