import { type CryptoAlgorithm, type NamedEncrypter, Certificate, CertNaming, createEncrypter, RSAOAEP, ValidityPeriod } from "@ndn/keychain";
import { SafeBag } from "@ndn/ndnsec";
import { type LLDecrypt, type Name, type Signer, Component, Data } from "@ndn/packet";
import { Decoder, Encoder, EvDecoder } from "@ndn/tlv";
import { crypto, toHex, toUtf8 } from "@ndn/util";

import { DefaultFreshness, Keyword, TT } from "./an";
import { KeyEncryptionKey, makeNameInternal as makeKekName, parseNameInternal as parseKekName } from "./kek";

const EVD = new EvDecoder<KeyDecryptionKey.Fields>("KeyDecryptionKey", TT.EncryptedContent)
  .add(TT.EncryptedPayload, (t, { vd }) => t.safeBag = vd.decode(SafeBag), { required: true })
  .add(TT.EncryptedPayloadKey, (t, { value }) => t.encryptedPassphrase = value, { required: true });

/** NAC key decryption key. */
export class KeyDecryptionKey {
  /** Parse key decryption key from Data packet. */
  public static async fromData(data: Data): Promise<KeyDecryptionKey> {
    return new KeyDecryptionKey(data);
  }

  private constructor(public readonly data: Data) {
    Object.assign(this, KeyDecryptionKey.parseName(data.name));
    EVD.decode(this, new Decoder(data.content));
  }

  public get name(): Name {
    return this.data.name;
  }

  public async loadKeyPair(decrypter: LLDecrypt.Key, extractable = false): Promise<CryptoAlgorithm.GeneratedKeyPair> {
    const { plaintext } = await decrypter.llDecrypt({ ciphertext: this.encryptedPassphrase });
    const pkcs8 = await this.safeBag.decryptKey(plaintext);
    return RSAOAEP.cryptoGenerate({ importPkcs8: [pkcs8, this.safeBag.certificate.publicKeySpki] }, extractable);
  }
}
export interface KeyDecryptionKey extends Readonly<KeyDecryptionKey.NameParts>, Readonly<KeyDecryptionKey.Fields> {}

const SafeBagIssuerId = Component.from("NDNts-nac");

export namespace KeyDecryptionKey {
  export interface NameParts extends KeyEncryptionKey.NameParts {
    memberKeyName: Name;
  }

  export interface Fields {
    safeBag: SafeBag;
    encryptedPassphrase: Uint8Array;
  }

  /** Parse key decryption key Data name. */
  export function parseName(name: Name): NameParts {
    const pos = name.comps.findIndex((comp) => comp.equals(Keyword.ENCRYPTED_BY));
    let memberKeyName: Name;
    if (pos < 0 || !CertNaming.isKeyName(memberKeyName = name.slice(pos + 1))) {
      throw new Error("bad KDK name");
    }
    return {
      ...parseKekName(name.getPrefix(pos), Keyword.KDK, "KDK"),
      memberKeyName,
    };
  }

  /** Create key decryption key Data name. */
  export function makeName(parts: NameParts): Name {
    const { memberKeyName } = parts;
    return makeKekName(parts, Keyword.KDK).append(Keyword.ENCRYPTED_BY, ...memberKeyName.comps);
  }

  export interface Options {
    kek: KeyEncryptionKey;

    /** KEK-KDK RSA-OAEP key pair. */
    keyPair: CryptoAlgorithm.GeneratedKeyPair;

    /** Member RSA-OAEP public key. */
    member: NamedEncrypter.PublicKey;

    signer: Signer;
  }

  /** Create key decryption key packet. */
  export async function build({
    kek,
    keyPair,
    member,
    signer,
  }: Options): Promise<KeyDecryptionKey> {
    const cert = await Certificate.issue({
      validity: ValidityPeriod.MAX,
      issuerId: SafeBagIssuerId,
      issuerPrivateKey: signer,
      publicKey: createEncrypter(makeKekName(kek, Keyword.KEY), RSAOAEP, keyPair),
    });

    const pvt = new Uint8Array(await crypto.subtle.exportKey("pkcs8", keyPair.privateKey));
    const passphrase = toHex(crypto.getRandomValues(new Uint8Array(16)));
    const safeBag = await SafeBag.create(cert, pvt, passphrase);

    const { ciphertext } = await member.llEncrypt({ plaintext: toUtf8(passphrase) });

    const data = new Data();
    data.name = makeName({ ...kek, memberKeyName: member.name });
    data.freshnessPeriod = DefaultFreshness;
    data.content = Encoder.encode([
      TT.EncryptedContent,
      [TT.EncryptedPayload, safeBag],
      [TT.EncryptedPayloadKey, ciphertext],
    ]);
    await signer.sign(data);
    return KeyDecryptionKey.fromData(data);
  }
}
