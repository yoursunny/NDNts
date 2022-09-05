import { type LLSign, type LLVerify, SigType, Verifier } from "@ndn/packet";
import { crypto } from "@ndn/util";
import type * as asn1 from "@yoursunny/asn1";
import { Ed25519Algorithm, polyfillEd25519 } from "@yoursunny/webcrypto-ed25519";

import type { CryptoAlgorithm, SigningAlgorithm } from "../key/mod";
import { extractSpkiAlgorithm } from "./impl-spki";

polyfillEd25519();

class NodeEd implements SigningAlgorithm<{}, true, {}> {
  constructor(
      public readonly uuid: string,
      public readonly sigType: number,
      private readonly algo: KeyAlgorithm,
      private readonly oid: string,
  ) {}

  public readonly keyUsages = {
    private: ["sign"],
    public: ["verify"],
  } as const;

  public async cryptoGenerate({ importPkcs8 }: EdGenParams, extractable: boolean) {
    let privateKey: CryptoKey;
    let publicKey: CryptoKey;
    if (importPkcs8) {
      const [pkcs8, spki] = importPkcs8;
      [privateKey, publicKey] = await Promise.all([
        crypto.subtle.importKey("pkcs8", pkcs8, this.algo, extractable, this.keyUsages.private),
        crypto.subtle.importKey("spki", spki, this.algo, true, this.keyUsages.public),
      ]);
    } else {
      ({ privateKey, publicKey } = await crypto.subtle.generateKey(this.algo, extractable,
        [...this.keyUsages.private, ...this.keyUsages.public]) as CryptoKeyPair);
    }

    const spki = new Uint8Array(await crypto.subtle.exportKey("spki", publicKey));
    return {
      privateKey,
      publicKey,
      jwkImportParams: this.algo,
      spki,
      info: {},
    };
  }

  public async importSpki(spki: Uint8Array, der: asn1.ElementBuffer) {
    if (extractSpkiAlgorithm(der) !== this.oid) {
      throw new Error(`not ${this.algo.name} key`);
    }
    const key = await crypto.subtle.importKey(
      "spki", spki, this.algo, true, this.keyUsages.public);
    return {
      publicKey: key,
      spki,
      info: {},
    };
  }

  public makeLLSign({ privateKey }: CryptoAlgorithm.PrivateKey<{}>): LLSign {
    return async (input) => {
      const raw = await crypto.subtle.sign(this.algo, privateKey, input);
      return new Uint8Array(raw);
    };
  }

  public makeLLVerify({ publicKey }: CryptoAlgorithm.PublicKey<{}>): LLVerify {
    return async (input, sig) => {
      const ok = await crypto.subtle.verify(this.algo, publicKey, sig, input);
      Verifier.throwOnBadSig(ok);
    };
  }
}

/** Key generation parameters. */
interface EdGenParams {
  /** Import PKCS#8 private key and SPKI public key instead of generating. */
  importPkcs8?: [pkcs8: Uint8Array, spki: Uint8Array];
}

/** Ed25519 signing algorithm. */
export const Ed25519: SigningAlgorithm<{}, true, {}> = new NodeEd(
  "fa9e8104-39b1-4a8e-828d-8c557d973476",
  SigType.Ed25519,
  Ed25519Algorithm,
  "2B6570", // 1.3.101.112
);

export namespace Ed25519 {
  export type GenParams = EdGenParams;
}
