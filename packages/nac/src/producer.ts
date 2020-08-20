import { AES, createEncrypter } from "@ndn/keychain";
import type { Data, Encrypter, Name, Signer } from "@ndn/packet";
import type { DataStore as RepoDataStore } from "@ndn/repo-api";
import { Encoder } from "@ndn/tlv";
import DefaultWeakMap from "mnemonist/default-weak-map";

import { ContentKey, EncryptedContent, KeyEncryptionKey } from "./packet/mod";

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
  ) {
  }

  private readonly keys = new DefaultWeakMap<KeyEncryptionKey, Promise<[ContentKey, Encrypter]>>(async (kek: KeyEncryptionKey): Promise<[ContentKey, Encrypter]> => {
    const key = await AES.CBC.cryptoGenerate({}, true);
    const ck = await ContentKey.build({
      kek,
      key,
      ckPrefix: this.ckPrefix,
      signer: this.signer,
    });
    await this.dataStore.insert(ck.data);
    const encrypter = createEncrypter(AES.CBC, key);
    return [ck, encrypter];
  });

  public async encrypt(kek: KeyEncryptionKey, data: Data): Promise<void> {
    const [ck, encrypter] = await this.keys.get(kek);
    const encrypted = await encrypter.llEncrypt({ plaintext: data.content });
    const enc = EncryptedContent.create(encrypted, ck.name);
    data.content = Encoder.encode(enc, data.content.length + 256);
  }
}

export namespace Producer {
  /** Subset of repo DataStore functions needed by Producer. */
  export type DataStore = Pick<RepoDataStore, "insert">;

  export interface Options {
    /** Store for publishing CK packets. */
    dataStore: DataStore;

    /** Content key prefix. */
    ckPrefix: Name;

    /** Signer for CK. */
    signer: Signer;
  }
}
