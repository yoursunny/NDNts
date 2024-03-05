import { consume, type ConsumerOptions, type Endpoint } from "@ndn/endpoint";
import { Certificate, CertNaming, createEncrypter, type CryptoAlgorithm, type NamedDecrypter, type NamedEncrypter, RSAOAEP } from "@ndn/keychain";
import { type Component, Interest, Name, type Signer, type Verifier } from "@ndn/packet";
import type { DataStore as S } from "@ndn/repo-api";
import { assert } from "@ndn/util";

import { Keyword } from "./packet/an";
import { KeyDecryptionKey, KeyEncryptionKey } from "./packet/mod";

/** NAC access manager. */
export class AccessManager {
  public static create({
    endpoint, // eslint-disable-line etc/no-deprecated
    cOpts,
    dataStore,
    prefix,
    keys,
  }: AccessManager.Options): AccessManager {
    return new AccessManager(
      {
        describe: `NAC-AccessManager(${prefix})`,
        retx: 2,
        ...endpoint?.cOpts,
        ...cOpts,
      },
      dataStore,
      prefix,
      keys,
    );
  }

  private constructor(
      private readonly cOpts: ConsumerOptions,
      private readonly dataStore: AccessManager.DataStore,
      private readonly prefix: Name,
      private readonly keys: AccessManager.Keys,
  ) {}

  /** Create a new Key Encryption Key. */
  public async createKek(subset: Name): Promise<AccessManager.KekHandle> {
    const keyPair = await RSAOAEP.cryptoGenerate({}, true);
    const subjectName = KeyEncryptionKey.makeSubjectName({ prefix: this.prefix, subset });
    const keyName = CertNaming.makeKeyName(subjectName);
    const kek = await KeyEncryptionKey.build({
      publicKey: createEncrypter(keyName, RSAOAEP, keyPair),
      signer: this.keys.signer,
    });

    const ownKdk = await this.makeKdk(kek, keyPair, this.keys.ownKdkEncrypter);
    await this.dataStore.insert(kek.data, ownKdk.data);
    return this.makeKekHandle(kek, keyPair);
  }

  /** Find an existing Key Encryption Key. */
  public async lookupKek(subset: Name, keyId?: Component): Promise<AccessManager.KekHandle> {
    const kekData = keyId ?
      await this.dataStore.get(KeyEncryptionKey.makeName({ prefix: this.prefix, subset, keyId })) :
      await this.dataStore.find(new Interest(
        KeyEncryptionKey.makeSubjectName({ prefix: this.prefix, subset }).append(Keyword.KEK),
        Interest.CanBePrefix));
    assert(!!kekData, "KEK not found");
    const kek = await KeyEncryptionKey.fromData(kekData);

    const kdkData = await this.dataStore.get(KeyDecryptionKey.makeName({
      ...kek, memberKeyName: this.keys.ownKdkDecrypter.name }));
    assert(!!kdkData, "KDK not found");
    await this.keys.ownKdkVerifier?.verify(kdkData);
    const ownKdk = await KeyDecryptionKey.fromData(kdkData);
    return this.makeKekHandle(kek, await ownKdk.loadKeyPair(this.keys.ownKdkDecrypter, true));
  }

  private makeKekHandle(kek: KeyEncryptionKey, keyPair: CryptoAlgorithm.GeneratedKeyPair): AccessManager.KekHandle {
    return {
      kek,
      grant: async (member) => {
        member = await this.extractMemberKey(member);
        const kdk = await this.makeKdk(kek, keyPair, member);
        await this.dataStore.insert(kdk.data);
        return kdk;
      },
    };
  }

  private async extractMemberKey(member: NamedEncrypter.PublicKey | Certificate | Name): Promise<NamedEncrypter.PublicKey> {
    if (member instanceof Name) {
      assert(!!this.keys.memberVerifier, "cannot retrieve member certificate without memberVerifier");
      const data = await consume(
        new Interest(member, Interest.CanBePrefix, Interest.MustBeFresh),
        { ...this.cOpts, verifier: this.keys.memberVerifier });
      member = Certificate.fromData(data);
    }
    if (member instanceof Certificate) {
      member = await createEncrypter(member, { algoList: [RSAOAEP] });
    }
    return member;
  }

  private async makeKdk(kek: KeyEncryptionKey, keyPair: CryptoAlgorithm.GeneratedKeyPair, member: NamedEncrypter.PublicKey): Promise<KeyDecryptionKey> {
    return KeyDecryptionKey.build({
      kek,
      keyPair,
      member,
      signer: this.keys.signer,
    });
  }
}

export namespace AccessManager {
  /** Subset of repo DataStore functions needed by AccessManager. */
  export interface DataStore extends S.Get, S.Find, S.Insert {
  }

  /** Set of keys used by AccessManager. */
  export interface Keys {
    /** Signer for KEK, KDK, and KDK SafeBag. */
    signer: Signer;

    /**
     * Verifier for member RSA-OAEP certificates.
     *
     * @remarks
     * This is only used if a Name would be passed to {@link KekHandle.grant} function.
     * If unspecified, {@link KekHandle.grant} does not accept Name.
     */
    memberVerifier?: Verifier;

    /** Encrypter for own KDK. */
    ownKdkEncrypter: NamedEncrypter;

    /** Decrypter for own KDK. */
    ownKdkDecrypter: NamedDecrypter;

    /**
     * Verifier for own KDK.
     *
     * @remarks
     * This is only needed if {@link Options.dataStore} cannot be trusted (e.g. it's a network
     * based repo). Otherwise, no verification is needed.
     */
    ownKdkVerifier?: Verifier;
  }

  /** {@link AccessManager.create} options. */
  export interface Options {
    /**
     * Endpoint for communication.
     * @deprecated Specify `.cOpts`.
     */
    endpoint?: Endpoint;

    /**
     * Consumer options.
     *
     * @remarks
     * - `.describe` defaults to "NAC-AccessManager" + `.prefix`.
     * - `.retx` defaults to 2.
     * - `.verifier` is overridden.
     */
    cOpts?: ConsumerOptions;

    /** Repo for publishing KEK and KDK packets. */
    dataStore: DataStore;

    /** Access policy prefix. */
    prefix: Name;

    /** Set of keys. */
    keys: Keys;
  }

  /** Handle of a key encryption key. */
  export interface KekHandle {
    readonly kek: KeyEncryptionKey;

    /**
     * Grant access to a new member.
     *
     * @remarks
     * Caller is responsible for verifying authenticity of the public key or certificate.
     * If passing a key name or certificate name, the retrieved certificate will be verified by
     * {@link Keys.memberVerifier}.
     */
    grant: (member: NamedEncrypter.PublicKey | Certificate | Name) => Promise<KeyDecryptionKey>;
  }
}
