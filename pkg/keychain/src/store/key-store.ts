import type { Name } from "@ndn/packet";
import { assert } from "@ndn/util";

import { createDecrypter, createEncrypter, createSigner, createVerifier, CryptoAlgorithm, KeyKind, type NamedDecrypter, type NamedEncrypter, type NamedSigner, type NamedVerifier, type PublicKey } from "../key/mod";
import { StoreBase, type StoreProvider } from "./store-base";

/** KV store of named key pairs. */
export class KeyStore extends StoreBase<KeyStore.StoredKey> {
  constructor(provider: StoreProvider<KeyStore.StoredKey>, algoList: readonly CryptoAlgorithm[]) {
    super(provider);
    this.loader = new KeyStore.Loader(false, algoList);
  }

  private readonly loader: KeyStore.Loader;

  public async get(name: Name): Promise<KeyStore.KeyPair> {
    const stored = await this.getValue(name);
    return this.loader.loadKey(name, stored);
  }

  public async insert(name: Name, stored: KeyStore.StoredKey): Promise<void> {
    const algo = this.loader.findAlgo(stored.algo);
    if (!algo) {
      throw new Error(`unknown algorithm uuid ${stored.algo}`);
    }

    if (stored.publicKeySpki !== undefined) {
      stored.publicKeySpki = this.bufferToStorable(stored.publicKeySpki);
    }
    await this.insertValue(name, stored);
  }
}

export namespace KeyStore {
  /** Loaded key pair. */
  export class KeyPair<Asym extends boolean = any, I = any> {
    constructor(
        public readonly name: Name,
        public readonly algo: CryptoAlgorithm<I, Asym>,
        public readonly pvt: CryptoAlgorithm.PrivateSecretKey<I, Asym>,
        public readonly pub: CryptoAlgorithm.PublicSecretKey<I, Asym>,
    ) {}

    public get signer(): NamedSigner<Asym> {
      assert(CryptoAlgorithm.isSigning(this.algo), "signer is only available with a signing algorithm");
      return createSigner(this.name, this.algo, this.pvt);
    }

    public get verifier(): NamedVerifier<Asym> {
      assert(CryptoAlgorithm.isSigning(this.algo), "verifier is only available with a signing algorithm");
      return createVerifier(this.name, this.algo, this.pub);
    }

    public get encrypter(): NamedEncrypter<Asym> {
      assert(CryptoAlgorithm.isEncryption(this.algo), "encrypter is only available with an encryption algorithm");
      return createEncrypter(this.name, this.algo, this.pub);
    }

    public get decrypter(): NamedDecrypter<Asym> {
      assert(CryptoAlgorithm.isEncryption(this.algo), "decrypter is only available with an encryption algorithm");
      return createDecrypter(this.name, this.algo, this.pvt);
    }

    public get publicKey(): PublicKey {
      assert(CryptoAlgorithm.isAsym(this.algo), "publicKey is only available with an asymmetric algorithm");
      return {
        name: this.name,
        [KeyKind]: "public",
        spki: (this.pub as CryptoAlgorithm.PublicKey<I>).spki,
      };
    }
  }

  /** Stored key pair in JSON or structuredClone-compatible format. */
  export interface StoredKey {
    algo: string;
    info: any;
    jwkImportParams?: AlgorithmIdentifier;
    privateKey?: CryptoKey | JsonWebKey;
    publicKey?: CryptoKey | JsonWebKey;
    publicKeySpki?: Uint8Array | string;
    secretKey?: CryptoKey | JsonWebKey;
  }

  /** Helper to load key pair from stored format. */
  export class Loader {
    constructor(
        private readonly extractable: boolean,
        private readonly algoList: readonly CryptoAlgorithm[],
    ) {}

    public findAlgo(uuid: string): CryptoAlgorithm<unknown> | undefined {
      return this.algoList.find((algo) => algo.uuid === uuid);
    }

    public async loadKey(name: Name, stored: StoredKey): Promise<KeyPair> {
      const algo = this.findAlgo(stored.algo);
      if (!algo) {
        throw new Error(`unknown algorithm uuid ${stored.algo}`);
      }

      if (CryptoAlgorithm.isAsym(algo)) {
        return this.loadAsymmetric(name, algo, stored);
      }
      assert(CryptoAlgorithm.isSym(algo));
      return this.loadSymmetric(name, algo as CryptoAlgorithm<any, false>, stored);
    }

    private async loadAsymmetric(name: Name, algo: CryptoAlgorithm<any, true>, {
      info,
      jwkImportParams,
      privateKey,
      publicKey,
      publicKeySpki,
    }: StoredKey) {
      if (!privateKey || !publicKey || !publicKeySpki) {
        throw new Error("bad algorithm or key");
      }

      if (jwkImportParams) {
        [privateKey, publicKey] = await Promise.all([
          crypto.subtle.importKey(
            "jwk", privateKey as JsonWebKey, jwkImportParams,
            this.extractable, algo.keyUsages.private,
          ),
          crypto.subtle.importKey(
            "jwk", publicKey as JsonWebKey, jwkImportParams,
            this.extractable, algo.keyUsages.public,
          ),
        ]);
      }

      return new KeyPair(
        name,
        algo,
        { info, privateKey: privateKey as CryptoKey },
        { info, publicKey: publicKey as CryptoKey, spki: StoreBase.bufferFromStorable(publicKeySpki) },
      );
    }

    private async loadSymmetric(name: Name, algo: CryptoAlgorithm<any, false>, {
      info,
      jwkImportParams,
      secretKey,
    }: StoredKey) {
      if (!secretKey) {
        throw new Error("bad algorithm or key");
      }

      if (jwkImportParams) {
        secretKey = await crypto.subtle.importKey(
          "jwk", secretKey as JsonWebKey,
          jwkImportParams, this.extractable, algo.keyUsages.secret,
        );
      }

      const key = { info, secretKey: secretKey as CryptoKey };
      return new KeyPair(name, algo, key, key);
    }
  }
}
