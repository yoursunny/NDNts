import { createEncrypter, type NamedEncrypter, RSAOAEP } from "@ndn/keychain";
import { Component, Data, type LLEncrypt, type Name, type Signer } from "@ndn/packet";
import * as asn1 from "@yoursunny/asn1";

import { ContentTypeKEY, DefaultFreshness, Keyword } from "./an";

/** NAC key encryption key. */
export class KeyEncryptionKey {
  /** Parse key encryption key from Data packet. */
  public static async fromData(data: Data): Promise<KeyEncryptionKey> {
    const kek = new KeyEncryptionKey(data);
    const der = asn1.parseVerbose(kek.publicKeySpki);
    const pub = await RSAOAEP.importSpki!(kek.publicKeySpki, der);
    kek.encrypter_ = createEncrypter(RSAOAEP, pub);
    return kek;
  }

  private constructor(public readonly data: Data) {
    Object.assign(this, KeyEncryptionKey.parseName(data.name));
  }

  public get name(): Name {
    return this.data.name;
  }

  /** Public key in SubjectPublicKeyInfo (SPKI) binary format. */
  public get publicKeySpki(): Uint8Array {
    return this.data.content;
  }

  private encrypter_!: LLEncrypt.Key;
  public get encrypter() { return this.encrypter_; }
}
export interface KeyEncryptionKey extends Readonly<KeyEncryptionKey.NameParts> {}

export function parseNameInternal(name: Name, keyword2: Component, type = "KEK"): KeyEncryptionKey.NameParts {
  const pos1 = name.comps.findIndex((comp) => comp.equals(Keyword.NAC));
  const pos2 = name.comps.findIndex((comp) => comp.equals(keyword2));
  if (pos1 < 0 || pos2 < 0 || name.length !== pos2 + 2) {
    throw new Error(`bad ${type} name`);
  }
  return {
    prefix: name.slice(0, pos1),
    subset: name.slice(pos1 + 1, pos2),
    keyId: name.at(pos2 + 1),
  };
}

export function makeNameInternal(parts: KeyEncryptionKey.NameParts, keyword2: Component): Name {
  return KeyEncryptionKey.makeSubjectName(parts).append(keyword2, parts.keyId);
}

export namespace KeyEncryptionKey {
  export interface NameParts {
    prefix: Name;
    subset: Name;
    keyId: Component;
  }

  /** Parse key encryption key Data name. */
  export function parseName(name: Name): NameParts {
    return parseNameInternal(name, Keyword.KEK);
  }

  /** Create subject name for RSA-OAEP key generation. */
  export function makeSubjectName({ prefix, subset }: Omit<NameParts, "keyId">): Name {
    return prefix.append(Keyword.NAC, ...subset.comps);
  }

  /** Create key encryption key Data name. */
  export function makeName(parts: NameParts): Name {
    return makeNameInternal(parts, Keyword.KEK);
  }

  export interface Options {
    /** KEK RSA-OAEP public key. */
    publicKey: NamedEncrypter.PublicKey;

    signer: Signer;
  }

  /** Create key encryption key packet. */
  export async function build({
    publicKey,
    signer,
  }: Options): Promise<KeyEncryptionKey> {
    if (!publicKey.spki) {
      throw new Error("missing SPKI");
    }

    const data = new Data();
    data.name = makeName(parseNameInternal(publicKey.name, Keyword.KEY));
    data.contentType = ContentTypeKEY;
    data.freshnessPeriod = DefaultFreshness;
    data.content = publicKey.spki;
    await signer.sign(data);

    return KeyEncryptionKey.fromData(data);
  }
}
