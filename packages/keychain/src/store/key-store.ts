import type { Name } from "@ndn/packet";

import { crypto } from "../key/crypto_node";
import { createSigner, createVerifier, CryptoAlgorithm, NamedSigner, NamedVerifier, SigningAlgorithm, SigningAlgorithmList } from "../key/mod";
import { StoreBase } from "./store-base";

/** Storage of key pairs. */
export class KeyStore extends StoreBase<KeyStore.StoredKey> {
  private findAlgo(uuid: string): SigningAlgorithm<unknown>|undefined {
    for (const algo of SigningAlgorithmList) {
      if (algo.uuid === uuid) {
        return algo;
      }
    }
    return undefined;
  }

  public async get(name: Name): Promise<[NamedSigner, NamedVerifier]> {
    const stored = await this.getImpl(name);
    const [pvt, pub] = await this.loadKey(name, stored);
    return [pvt, pub];
  }

  protected loadKeyExtractable = false;

  protected async loadKey(name: Name, stored: KeyStore.StoredKey): Promise<[NamedSigner, NamedVerifier, CryptoKey[]]> {
    const algo = this.findAlgo(stored.algo);
    if (!algo) {
      throw new Error(`unknown algorithm uuid ${stored.algo}`);
    }

    if (stored.privateKey) {
      const [pvt, pub] = await this.loadAsymmetric(algo, stored);
      return [
        createSigner(name, algo, pvt),
        createVerifier(name, algo, pub),
        [pvt.privateKey, pub.publicKey],
      ];
    }
    const secret = await this.loadSymmetric(algo, stored);
    return [
      createSigner(name, algo, secret),
      createVerifier(name, algo, secret),
      [secret.secretKey],
    ];
  }

  private async loadAsymmetric(algo: CryptoAlgorithm<any>, {
    info,
    jwkImportParams,
    privateKey,
    publicKey,
    publicKeySpki,
  }: KeyStore.StoredKey): Promise<[CryptoAlgorithm.PrivateKey<any>, CryptoAlgorithm.PublicKey<any>]> {
    if (!algo.privateKeyUsages || !algo.publicKeyUsages || !privateKey || !publicKey || !publicKeySpki) {
      throw new Error("bad algorithm or key");
    }

    if (jwkImportParams) {
      [privateKey, publicKey] = await Promise.all([
        crypto.subtle.importKey("jwk", privateKey as JsonWebKey, jwkImportParams,
          this.loadKeyExtractable, [...algo.privateKeyUsages]),
        crypto.subtle.importKey("jwk", publicKey as JsonWebKey, jwkImportParams,
          this.loadKeyExtractable, [...algo.publicKeyUsages]),
      ]);
    }

    return [
      { info, privateKey: privateKey as CryptoKey },
      { info, publicKey: publicKey as CryptoKey, spki: this.bufferFromStorable(publicKeySpki) },
    ];
  }

  private async loadSymmetric(algo: CryptoAlgorithm<any>, {
    info,
    jwkImportParams,
    secretKey,
  }: KeyStore.StoredKey): Promise<CryptoAlgorithm.SecretKey<any>> {
    if (!algo.secretKeyUsages || !secretKey) {
      throw new Error("bad algorithm or key");
    }

    if (jwkImportParams) {
      secretKey = await crypto.subtle.importKey("jwk", secretKey as JsonWebKey,
        jwkImportParams, this.loadKeyExtractable, [...algo.secretKeyUsages]);
    }

    return { info, secretKey: secretKey as CryptoKey };
  }

  public async insert(name: Name, stored: KeyStore.StoredKey): Promise<void> {
    const algo = this.findAlgo(stored.algo);
    if (!algo) {
      throw new Error(`unknown algorithm uuid ${stored.algo}`);
    }

    if (stored.publicKeySpki) {
      stored.publicKeySpki = this.bufferToStorable(stored.publicKeySpki);
    }
    await this.insertImpl(name, stored);
  }
}

export namespace KeyStore {
  export interface StoredKey {
    algo: string;
    info: any;
    jwkImportParams?: AlgorithmIdentifier;
    privateKey?: CryptoKey|JsonWebKey;
    publicKey?: CryptoKey|JsonWebKey;
    publicKeySpki?: Uint8Array|string;
    secretKey?: CryptoKey|JsonWebKey;
  }
}
