import { type LLSign, type LLVerify, SigType, Verifier } from "@ndn/packet";
import { crypto } from "@ndn/util";

import type { CryptoAlgorithm, SigningAlgorithm } from "../key/mod";
import { RsaCommon, type RsaModulusLength } from "./rsa-common";

/** Sha256WithRsa signing algorithm. */
export const RSA: SigningAlgorithm<{}, true, RSA.GenParams> = new class extends RsaCommon implements SigningAlgorithm<{}, true, RSA.GenParams> {
  constructor() {
    super("RSASSA-PKCS1-v1_5");
  }

  public override readonly uuid = "771b4ccd-3e8d-4ad5-9422-248f18c6fcb5";
  public override readonly keyUsages = { private: ["sign"], public: ["verify"] } as const;
  public readonly sigType = SigType.Sha256WithRsa;

  public makeLLSign({ privateKey }: CryptoAlgorithm.PrivateKey<{}>): LLSign {
    return async (input) => {
      const raw = await crypto.subtle.sign(this.name, privateKey, input);
      return new Uint8Array(raw);
    };
  }

  public makeLLVerify({ publicKey }: CryptoAlgorithm.PublicKey<{}>): LLVerify {
    return async (input, sig) => {
      const ok = await crypto.subtle.verify(this.name, publicKey, sig, input);
      Verifier.throwOnBadSig(ok);
    };
  }
}();

export namespace RSA {
  export interface GenParams {
    modulusLength?: RsaModulusLength;

    /** Import PKCS#8 private key and SPKI public key instead of generating. */
    importPkcs8?: [pkcs8: Uint8Array, spki: Uint8Array];
  }
}
