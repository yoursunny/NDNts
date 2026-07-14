import { type Certificate, CertNaming, CryptoAlgorithm, type ECDSA, type Ed25519, generateSigningKey, type KeyChain, type RSA } from "@ndn/keychain";
import { type Data, type Name, SigType } from "@ndn/packet";
import { assert } from "@ndn/util";

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
  public set cert(value) {
    if (value) {
      assert(
        CertNaming.toKeyName(value.name).equals(this.keyName),
        `cert ${value.name} and key ${this.keyName} mismatch`,
      );
    }
    this.cert_ = value;
  }

  /**
   * Save key pair and certificate to KeyChain.
   * @param keyChain - Destination KeyChain.
   */
  public async saveKeyPair(keyChain: KeyChain): Promise<void> {
    assert(this.cert_, ".cert needed");
    for (const algo of keyChain.algoList) {
      if (!(CryptoAlgorithm.isAsym(algo) &&
        CryptoAlgorithm.isSigning(algo) &&
        algo.sigType === this.sigType &&
        algo.sigType in importParamKey)) {
        continue;
      }
      const genParams = { [importParamKey[algo.sigType as keyof typeof importParamKey]]: [this.secret, this.cert_.publicKeySpki] };
      await generateSigningKey(keyChain, this.keyName, algo, genParams);
      await keyChain.insertCert(this.cert_);
      return;
    }
    throw new Error(`SigType ${this.sigType} not supported or not in algoList`);
  }
}

const importParamKey = {
  [SigType.Ed25519]: "importPkcs8" satisfies keyof Ed25519.GenParams,
  [SigType.Sha256WithRsa]: "importPkcs1" satisfies keyof RSA.GenParams,
  [SigType.Sha256WithEcdsa]: "importSec1" satisfies keyof ECDSA.GenParams,
} as const;
