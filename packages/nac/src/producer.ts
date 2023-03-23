import { AESCBC, createEncrypter } from "@ndn/keychain";
import type { Data, Encrypter, LLEncrypt, Name, Signer } from "@ndn/packet";
import type { DataStore as S } from "@ndn/repo-api";
import { Encoder } from "@ndn/tlv";
import DefaultWeakMap from "mnemonist/default-weak-map.js";

import { ContentKey, EncryptedContent, type KeyEncryptionKey } from "./packet/mod";

/** NAC producer. */
export class Producer {
  public static create({
    dataStore,
    ckPrefix,
    signer,
  }: Producer.Options): Producer {
    return new Producer(
      dataStore,
      ckPrefix,
      signer,
    );
  }

  private constructor(
      private readonly dataStore: Producer.DataStore,
      private readonly ckPrefix: Name,
      private readonly signer: Signer,
  ) {}

  private readonly keys = new DefaultWeakMap<KeyEncryptionKey, Promise<[ContentKey, LLEncrypt.Key]>>(async (kek: KeyEncryptionKey): Promise<[ContentKey, LLEncrypt.Key]> => {
    const key = await AESCBC.cryptoGenerate({}, true);
    const ck = await ContentKey.build({
      kek,
      key,
      ckPrefix: this.ckPrefix,
      signer: this.signer,
    });
    await this.dataStore.insert(ck.data);
    const llEncrypter = createEncrypter(AESCBC, key);
    return [ck, llEncrypter];
  });

  public async createEncrypter(kek: KeyEncryptionKey): Promise<Encrypter> {
    const [ck, llEncrypter] = await this.keys.get(kek);
    return {
      async encrypt(data: Data) {
        const encrypted = await llEncrypter.llEncrypt({ plaintext: data.content });
        const enc = EncryptedContent.create(encrypted, ck.locator);
        data.content = Encoder.encode(enc, data.content.length + 256);
      },
    };
  }
}

export namespace Producer {
  /** Subset of repo DataStore functions needed by Producer. */
  export interface DataStore extends S.Insert {
  }

  export interface Options {
    /** Store for publishing CK packets. */
    dataStore: DataStore;

    /** Content key prefix. */
    ckPrefix: Name;

    /** Signer for CK. */
    signer: Signer;
  }
}
