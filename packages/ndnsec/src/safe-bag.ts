import { Certificate, CertNaming, ECDSA, generateSigningKey, KeyChain, RSA, SigningAlgorithm } from "@ndn/keychain";
import { Data, TT as l3TT } from "@ndn/packet";
import { Decoder, Encoder, EvDecoder } from "@ndn/tlv";
import { createPrivateKey } from "crypto";

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

  constructor(public readonly certificate: Certificate, public readonly encryptedKey: Uint8Array) {
  }

  public encodeTo(encoder: Encoder) {
    encoder.prependTlv(TT.SafeBag,
      this.certificate.data,
      [TT.EncryptedKeyBag, this.encryptedKey],
    );
  }

  /** Decrypt private key and return unencrypted PKCS8 format. */
  public decryptKey(passphrase: string): Uint8Array {
    const key = createPrivateKey({
      key: Buffer.from(this.encryptedKey),
      type: "pkcs8",
      format: "der",
      passphrase,
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
  public async saveKeyPair(passphrase: string, keyChain: KeyChain): Promise<void> {
    const [algo, key] = await this.certificate.importPublicKey([ECDSA, RSA]);
    const pkcs8 = this.decryptKey(passphrase);
    await generateSigningKey(keyChain, CertNaming.toKeyName(this.certificate.name),
      algo as SigningAlgorithm<any, true, ECDSA.GenParams|RSA.GenParams>,
      { importPkcs8: [pkcs8, key.spki] });
  }
}
