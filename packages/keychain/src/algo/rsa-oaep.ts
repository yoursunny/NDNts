import { LLDecrypt, LLEncrypt } from "@ndn/packet";

import { crypto } from "../crypto_node";
import type { CryptoAlgorithm, EncryptionAlgorithm } from "../key/mod";
import type { RSA } from "./rsa";
import { RsaCommon } from "./rsa-common";

/** RSA-OAEP encryption algorithm. */
export const RSAOAEP: EncryptionAlgorithm<{}, true, RSA.GenParams> = new (class extends RsaCommon implements EncryptionAlgorithm<{}, true, RSA.GenParams> {
  constructor() {
    super("RSA-OAEP", "f9c1c143-a7a5-459c-8cdf-69c5f7191cfe",
      { private: ["decrypt"], public: ["encrypt"] }, "SHA-1");
  }

  public makeLLEncrypt({ publicKey }: CryptoAlgorithm.PublicKey<{}>): LLEncrypt {
    return async ({
      plaintext,
      additionalData,
    }) => {
      const ciphertext = new Uint8Array(await crypto.subtle.encrypt({
        name: this.name,
        label: additionalData,
      }, publicKey, plaintext));
      return { ciphertext };
    };
  }

  public makeLLDecrypt({ privateKey }: CryptoAlgorithm.PrivateKey<{}>): LLDecrypt {
    return async ({
      ciphertext,
      additionalData,
    }) => {
      const plaintext = new Uint8Array(await crypto.subtle.decrypt({
        name: this.name,
        label: additionalData,
      }, privateKey, ciphertext));
      return { plaintext };
    };
  }
})();
