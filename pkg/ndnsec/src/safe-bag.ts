import { Certificate, CertNaming, CryptoAlgorithm, ECDSA, generateEncryptionKey, generateSigningKey, type KeyChain, RSA, RSAOAEP } from "@ndn/keychain";
import { Data, TT as l3TT } from "@ndn/packet";
import { type Decoder, type Encoder, EvDecoder } from "@ndn/tlv";
import { assert } from "@ndn/util";

import { TT } from "./an";
import * as EncryptedPrivateKeyInfo from "./epki_node";

interface Fields {
  certificate: Certificate;
  encryptedKey: Uint8Array;
}

const EVD = new EvDecoder<Fields>("SafeBag", TT.SafeBag)
  .add(l3TT.Data, (t, { decoder }) => t.certificate = Certificate.fromData(decoder.decode(Data)), { required: true })
  .add(TT.EncryptedKey, (t, { value }) => t.encryptedKey = value, { required: true });

/**
 * ndn-cxx exported credentials.
 * @see {@link https://docs.named-data.net/ndn-cxx/0.8.1/specs/safe-bag.html}
 */
export class SafeBag {
  /** Create a SafeBag from certificate and private key. */
  public static async create(certificate: Certificate, privateKey: Uint8Array, passphrase: string | Uint8Array): Promise<SafeBag> {
    const encryptedKey = await EncryptedPrivateKeyInfo.create(privateKey, passphrase);
    return new SafeBag({ certificate, encryptedKey });
  }

  public static decodeFrom(decoder: Decoder): SafeBag {
    const fields = EVD.decode({} as Fields, decoder);
    return new SafeBag(fields);
  }

  private constructor(fields: Fields) {
    Object.assign(this, fields);
  }

  public encodeTo(encoder: Encoder): void {
    encoder.prependTlv(
      TT.SafeBag,
      this.certificate.data,
      [TT.EncryptedKey, this.encryptedKey],
    );
  }

  /**
   * Decrypt private key.
   * @param passphrase - SafeBag passphrase.
   * @returns Unencrypted private key in PKCS8 format.
   */
  public decryptKey(passphrase: string | Uint8Array): Promise<Uint8Array> {
    return EncryptedPrivateKeyInfo.decrypt(this.encryptedKey, passphrase);
  }

  /**
   * Save private key and public key to KeyChain.
   * @param passphrase - SafeBag passphrase.
   * @param keyChain - Destination KeyChain.
   */
  public async saveKeyPair(
      passphrase: string | Uint8Array,
      keyChain: KeyChain,
      { preferRSAOAEP = false }: SafeBag.ImportOptions = {},
  ): Promise<void> {
    const algoList: CryptoAlgorithm[] = [ECDSA, preferRSAOAEP ? RSAOAEP : RSA];
    const [algo, key] = await this.certificate.importPublicKey(algoList);
    assert(CryptoAlgorithm.isAsym(algo));

    const keyName = CertNaming.toKeyName(this.certificate.name);
    const pkcs8 = await this.decryptKey(passphrase);
    if (CryptoAlgorithm.isSigning(algo)) {
      await generateSigningKey(keyChain, keyName, algo, { importPkcs8: [pkcs8, key.spki] });
    } else {
      assert(CryptoAlgorithm.isEncryption(algo));
      await generateEncryptionKey(keyChain, keyName, algo, { importPkcs8: [pkcs8, key.spki] });
    }
  }
}
export interface SafeBag extends Readonly<Fields> {}

export namespace SafeBag {
  /** {@link SafeBag.saveKeyPair} options. */
  export interface ImportOptions {
    /**
     * Import RSA key as RSA-OAEP encryption key instead of RSA signing key.
     *
     * @remarks
     * ndn-cxx stores RSA signing key and RSA-OAEP encryption key in the same format.
     * By default, RSA key is imported as RSASSA-PKCS1-v1_5 signing key.
     * Set to true to import RSA key as RSA-OAEP encryption key instead.
     */
    preferRSAOAEP?: boolean;
  }
}
