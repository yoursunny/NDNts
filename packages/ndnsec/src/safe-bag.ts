import { Certificate, CertNaming, CryptoAlgorithm, ECDSA, generateEncryptionKey, generateSigningKey, KeyChain, RSA, RSAOAEP } from "@ndn/keychain";
import { Data, TT as l3TT } from "@ndn/packet";
import { Decoder, Encoder, EvDecoder } from "@ndn/tlv";
import { createPrivateKey } from "crypto";
import assert from "minimalistic-assert";

import { TT } from "./an";

interface SafeBagFields {
  certificate?: Certificate;
  encryptedKey?: Uint8Array;
}

const EVD = new EvDecoder<SafeBagFields>("SafeBag", TT.SafeBag)
  .add(l3TT.Data, (t, { decoder }) => t.certificate = Certificate.fromData(decoder.decode(Data)))
  .add(TT.EncryptedKeyBag, (t, { value }) => t.encryptedKey = value);

/** ndn-cxx private key export. */
export class SafeBag {
  public static create(certificate: Certificate, privateKey: Uint8Array, passphrase: string): SafeBag {
    const key = createPrivateKey({
      key: Buffer.from(privateKey),
      type: "pkcs8",
      format: "der",
    });
    const encryptedKey = key.export({
      type: "pkcs8",
      format: "der",
      cipher: "aes-256-cbc",
      passphrase,
    });
    return new SafeBag(certificate, encryptedKey);
  }

  public static decodeFrom(decoder: Decoder): SafeBag {
    const { certificate, encryptedKey } = EVD.decode({} as SafeBagFields, decoder);
    if (!certificate || !encryptedKey) {
      throw new Error("invalid SafeBag");
    }
    return new SafeBag(certificate, encryptedKey);
  }

  constructor(public readonly certificate: Certificate, public readonly encryptedKey: Uint8Array) {}

  public encodeTo(encoder: Encoder) {
    encoder.prependTlv(TT.SafeBag,
      this.certificate.data,
      [TT.EncryptedKeyBag, this.encryptedKey],
    );
  }

  /** Decrypt private key and return unencrypted PKCS8 format. */
  public decryptKey(passphrase: string|Uint8Array): Uint8Array {
    const key = createPrivateKey({
      key: Buffer.from(this.encryptedKey),
      type: "pkcs8",
      format: "der",
      passphrase: Buffer.from(passphrase),
    });
    return key.export({
      type: "pkcs8",
      format: "der",
    });
  }

  /**
   * Save private key and public key to KeyChain.
   * @param passphrase SafeBag passphrase.
   * @param keyChain destination KeyChain.
   */
  public async saveKeyPair(
      passphrase: string,
      keyChain: KeyChain,
      { preferRSAOAEP = false }: SafeBag.ImportOptions = {},
  ): Promise<void> {
    const algoList: CryptoAlgorithm[] = [ECDSA, preferRSAOAEP ? RSAOAEP : RSA];
    const [algo, key] = await this.certificate.importPublicKey(algoList);
    assert(CryptoAlgorithm.isAsym(algo));

    const keyName = CertNaming.toKeyName(this.certificate.name);
    const pkcs8 = this.decryptKey(passphrase);
    if (CryptoAlgorithm.isSigning(algo)) {
      await generateSigningKey(keyChain, keyName, algo, { importPkcs8: [pkcs8, key.spki] });
    } else if (CryptoAlgorithm.isEncryption(algo)) {
      await generateEncryptionKey(keyChain, keyName, algo, { importPkcs8: [pkcs8, key.spki] });
    }
  }
}

export namespace SafeBag {
  export interface ImportOptions {
    /**
     * ndn-cxx stores RSA signing key and RSA-OAEP encryption key in the same format.
     * By default, RSA key is imported as RSASSA-PKCS1-v1_5 signing key.
     * Set to true to import RSA key as RSA-OAEP encryption key instead.
     */
    preferRSAOAEP?: boolean;
  }
}
