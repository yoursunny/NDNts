import { AES, CryptoAlgorithm, KeyChainImplWebCrypto as crypto } from "@ndn/keychain";
import { Timestamp } from "@ndn/naming-convention2";
import { Component, Data, LLDecrypt, Name, Signer } from "@ndn/packet";
import { Decoder, Encoder, EvDecoder } from "@ndn/tlv";

import { DefaultFreshness, Keyword, TT } from "./an";
import { KeyEncryptionKey, makeNameInternal as makeKekName, parseNameInternal as parseKekName } from "./kek";

const EVD = new EvDecoder<ContentKey.Fields>("ContentKey", TT.EncryptedContent)
  .add(TT.EncryptedPayload, (t, { value }) => t.encryptedKey = value, { required: true });

/** NAC content key. */
export class ContentKey {
  /** Parse content key from Data packet. */
  public static async fromData(data: Data): Promise<ContentKey> {
    return new ContentKey(data);
  }

  private constructor(public readonly data: Data) {
    Object.assign(this, ContentKey.parseName(data.name));
    EVD.decode(this, new Decoder(data.content));
  }

  public get name(): Name {
    return this.data.name;
  }

  public async loadKey(decrypter: LLDecrypt.Key): Promise<CryptoAlgorithm.GeneratedSecretKey> {
    const { plaintext } = await decrypter.llDecrypt({ ciphertext: this.encryptedKey });
    return AES.CBC.cryptoGenerate({ importRaw: plaintext }, false);
  }
}
export interface ContentKey extends Readonly<ContentKey.NameParts>, Readonly<ContentKey.Fields> {}

export namespace ContentKey {
  export interface NameParts extends KeyEncryptionKey.NameParts {
    ckPrefix: Name;
    ckId: Component;
  }

  export interface Fields {
    encryptedKey: Uint8Array;
  }

  /** Parse content key Data name. */
  export function parseName(name: Name): NameParts {
    const pos1 = name.comps.findIndex((comp) => comp.equals(Keyword.CK));
    const pos2 = name.comps.findIndex((comp) => comp.equals(Keyword.ENCRYPTED_BY));
    if (pos1 < 0 || pos2 < 0 || pos1 + 2 !== pos2) {
      throw new Error("bad CK name");
    }
    return {
      ...parseKekName(name.slice(pos2 + 1), Keyword.KEK, "CK"),
      ckPrefix: name.slice(0, pos1),
      ckId: name.at(pos1 + 1),
    };
  }

  /** Create content key Data name. */
  export function makeName(parts: NameParts): Name {
    const { ckPrefix, ckId } = parts;
    return ckPrefix.append(Keyword.CK, ckId, Keyword.ENCRYPTED_BY, ...makeKekName(parts, Keyword.KEK).comps);
  }

  export interface Options {
    kek: KeyEncryptionKey;

    /** AES-CBC secret key. */
    key: CryptoAlgorithm.GeneratedSecretKey;

    ckPrefix: Name;
    ckId?: Component;

    signer: Signer;
  }

  /** Create content key packet. */
  export async function build({
    kek,
    key,
    ckPrefix,
    ckId = Timestamp.create(Date.now()),
    signer,
  }: Options): Promise<ContentKey> {
    const secret = new Uint8Array(await crypto.subtle.exportKey("raw", key.secretKey));
    const { ciphertext } = await kek.encrypter.llEncrypt({ plaintext: secret });

    const data = new Data();
    data.name = makeName({ ...kek, ckPrefix, ckId });
    data.freshnessPeriod = DefaultFreshness;
    data.content = Encoder.encode([
      TT.EncryptedContent,
      [TT.EncryptedPayload, ciphertext],
    ]);
    await signer.sign(data);
    return ContentKey.fromData(data);
  }
}
