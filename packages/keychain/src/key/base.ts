import { KeyLocator, LLSign, LLVerify, Name, SigInfo, Signer, Verifier } from "@ndn/packet";

import { KeyName } from "../name";

abstract class NamedKey {
  constructor(public readonly name: Name, public readonly sigType: number) {
    KeyName.from(name);
  }
}

/** Named private key. */
export abstract class PrivateKey extends NamedKey implements Signer {
  /**
   * Sign a packet.
   * @param pkt the packet.
   * @param keyLocator KeyLocator in SigInfo; if omitted, the key name will be used.
   */
  public sign(pkt: Signer.Signable, keyLocator = new KeyLocator(this.name)): Promise<void> {
    Signer.putSigInfo(pkt, this.sigType, keyLocator);
    return pkt[LLSign.OP]((input) => this.llSign(input));
  }

  protected abstract llSign(input: Uint8Array): Promise<Uint8Array>;

  /** Create a Signer that uses this PrivateKey and specified KeyLocator. */
  public withKeyLocator(keyLocator: KeyLocator.CtorArg): PrivateKey.WithKeyLocator {
    return new PrivateKey.WithKeyLocator(this, new KeyLocator(keyLocator));
  }
}

export namespace PrivateKey {
  export class WithKeyLocator implements Signer {
    constructor(public readonly key: PrivateKey, public readonly keyLocator: KeyLocator) {
    }

    public sign(pkt: Signer.Signable): Promise<void> {
      return this.key.sign(pkt, this.keyLocator);
    }
  }
}

/** Named public key. */
export abstract class PublicKey extends NamedKey implements Verifier {
  /** Verify a packet. */
  public verify(pkt: Verifier.Verifiable): Promise<void> {
    Verifier.checkSigType(pkt, this.sigType);
    this.checkSigInfo(pkt.sigInfo!);
    return pkt[LLVerify.OP]((input, sig) => this.llVerify(input, sig));
  }

  protected checkSigInfo(si: SigInfo): void {
    PublicKey.checkKeyLocator(si, this.name);
  }

  protected abstract llVerify(input: Uint8Array, sig: Uint8Array): Promise<void>;
}

export namespace PublicKey {
  export function checkKeyLocator(si: SigInfo|undefined, keyName: Name) {
    const klName = KeyLocator.mustGetName(si?.keyLocator);
    if (!keyName.isPrefixOf(klName)) {
      throw new Error(`KeyLocator ${klName} does not match key ${keyName}`);
    }
  }

  export interface Exportable {
    /** Export as SubjectPublicKeyInfo format. */
    exportAsSpki: () => Promise<Uint8Array>;
  }

  export function isExportable(key: unknown): key is PublicKey & Exportable {
    return typeof (key as Exportable).exportAsSpki === "function" && key instanceof PublicKey;
  }
}
