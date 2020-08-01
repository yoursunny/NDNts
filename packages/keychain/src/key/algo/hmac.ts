import { SigType, Verifier } from "@ndn/packet";

import { crypto } from "../crypto_node";
import { CryptoAlgorithm, SigningAlgorithm } from "../types";

const GenParams: HmacKeyGenParams&HmacImportParams = {
  name: "HMAC",
  hash: "SHA-256",
};

export const HMAC: SigningAlgorithm<{}, false, HMAC.GenParams> = {
  uuid: "d7001239-cb92-47b3-9376-2d1a781c70ac",
  sigType: SigType.HmacWithSha256,
  secretKeyUsages: ["sign", "verify"],

  async cryptoGenerate({ importRaw }: HMAC.GenParams, extractable: boolean) {
    let secretKey: CryptoKey;
    if (importRaw) {
      secretKey = await crypto.subtle.importKey("raw", importRaw,
        GenParams, extractable, [...this.secretKeyUsages!]);
    } else {
      secretKey = await crypto.subtle.generateKey(
        GenParams, extractable, [...this.secretKeyUsages!]) as CryptoKey;
    }
    return {
      secretKey,
      jwkImportParams: GenParams,
      info: {},
    };
  },

  makeLLSign({ secretKey }: CryptoAlgorithm.SecretKey<{}>) {
    return async (input) => {
      const h = await crypto.subtle.sign(GenParams.name, secretKey, input);
      return new Uint8Array(h);
    };
  },

  makeLLVerify({ secretKey }: CryptoAlgorithm.SecretKey<{}>) {
    return async (input, sig) => {
      const ok = await crypto.subtle.verify(GenParams.name, secretKey, sig, input);
      Verifier.throwOnBadSig(ok);
    };
  },
};

export namespace HMAC {
  /** Key generation parameters. */
  export interface GenParams {
    /** Import raw key bits instead of generating. */
    importRaw?: Uint8Array;
  }
}
