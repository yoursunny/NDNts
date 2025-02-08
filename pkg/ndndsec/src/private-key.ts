import { type Certificate, CertNaming, CryptoAlgorithm, generateSigningKey, type KeyChain } from "@ndn/keychain";
import type { Data, Name } from "@ndn/packet";
import { assert } from "@ndn/util";

import { toImportParams } from "./import_node";

export const ContentTypeUnencryptedPrivateKey = 0x09;

/** NDNd unencrypted private key. */
export class UnencryptedPrivateKey {
  constructor(public readonly data: Data) {
    assert(data.contentType === ContentTypeUnencryptedPrivateKey, "bad ContentType");
    assert(CertNaming.isKeyName(data.name), "bad Name");
  }

  /** Retrieve key name. */
  public get keyName(): Name {
    return this.data.name;
  }

  /** Retrieve signature type. */
  public get sigType(): number {
    return this.data.sigInfo.type;
  }

  /** Retrieve unencrypted private key. */
  public get secret(): Uint8Array {
    return this.data.content;
  }

  private cert_?: Certificate;

  /** Retrieve associated certificate. */
  public get cert(): Certificate | undefined {
    return this.cert_;
  }

  /**
   * Assign associated certificate.
   * @throws Error - Certificate does not match the key.
   */
  public set cert(v) {
    assert(!v || CertNaming.toKeyName(v.name).equals(this.keyName),
      `cert ${v!.name} and key ${this.keyName} mismatch`);
    this.cert_ = v;
  }

  /**
   * Save key pair and certificate to KeyChain.
   * @param keyChain - Destination KeyChain.
   */
  public async saveKeyPair(keyChain: KeyChain): Promise<void> {
    assert(this.cert_, ".cert needed");
    const [algo, genParams] = await toImportParams(this.sigType, this.secret, this.cert_.publicKeySpki);
    assert(CryptoAlgorithm.isAsym(algo));
    assert(CryptoAlgorithm.isSigning(algo));
    await generateSigningKey(keyChain, this.keyName, algo, genParams);
    await keyChain.insertCert(this.cert_);
  }
}
