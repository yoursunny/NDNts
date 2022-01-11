import { type CryptoAlgorithm, AESCBC, KeyChainImplWebCrypto as crypto } from "@ndn/keychain";
import { Timestamp } from "@ndn/naming-convention2";
import { type Signer, Component, Data, LLDecrypt, Name } from "@ndn/packet";
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

  public get locator(): Name {
    return ContentKey.makeLocator(this);
  }

  public get name(): Name {
    return this.data.name;
  }

  public async loadKey(decrypter: LLDecrypt.Key): Promise<CryptoAlgorithm.GeneratedSecretKey> {
    const { plaintext } = await decrypter.llDecrypt({ ciphertext: this.encryptedKey });
    return AESCBC.cryptoGenerate({ importRaw: plaintext }, false);
  }
}
export interface ContentKey extends Readonly<ContentKey.NameParts>, Readonly<ContentKey.Fields> {}

export namespace ContentKey {
  export interface LocatorParts {
    ckPrefix: Name;
    ckId: Component;
  }

  export interface NameParts extends LocatorParts, KeyEncryptionKey.NameParts {
  }

  export interface Fields {
    encryptedKey: Uint8Array;
  }

  /**
   * Parse content key locator name.
   * In an encrypted application packet, it appears in EncryptedPayload.Name field.
   */
  export function parseLocator(name: Name): LocatorParts {
    if (!name.get(-2)?.equals(Keyword.CK)) {
      throw new Error("bad CK locator");
    }
    return {
      ckPrefix: name.getPrefix(-2),
      ckId: name.get(-1)!,
    };
  }

  /** Create content key locator name. */
  export function makeLocator({ ckPrefix, ckId }: LocatorParts): Name {
    return ckPrefix.append(Keyword.CK, ckId);
  }

  /** Parse content key Data name. */
  export function parseName(name: Name): NameParts {
    let pos = name.length - 1;
    for (; pos >= 0; --pos) {
      if (name.get(pos)!.equals(Keyword.ENCRYPTED_BY)) {
        break;
      }
    }
    if (pos < 0) {
      throw new Error("bad CK name");
    }
    return {
      ...parseLocator(name.getPrefix(pos)),
      ...parseKekName(name.slice(pos + 1), Keyword.KEK, "CK"),
    };
  }

  /** Create content key Data name. */
  export function makeName(parts: NameParts): Name {
    return makeLocator(parts).append(Keyword.ENCRYPTED_BY, ...makeKekName(parts, Keyword.KEK).comps);
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
