import { KeyLocator, LLSign, LLVerify, Name, SigInfo, Signer, Verifier } from "@ndn/packet";

import { KeyName } from "../name";

abstract class NamedKey {
  constructor(public readonly name: Name, public readonly sigType: number,
      public readonly keyLocator: KeyLocator|undefined) {
    KeyName.from(name);
  }
}

/** Named private key. */
export abstract class PrivateKey extends NamedKey implements Signer {
  public sign(pkt: Signer.Signable): Promise<void> {
    this.putSigInfo(pkt);
    return pkt[LLSign.OP]((input) => this.llSign(input));
  }

  /** Override to modify SigInfo field. */
  protected putSigInfo(pkt: Signer.Signable): void {
    Signer.putSigInfo(pkt, this.sigType, this.keyLocator);
  }

  protected abstract llSign(input: Uint8Array): Promise<Uint8Array>;
}

/** Named public key. */
export abstract class PublicKey extends NamedKey implements Verifier {
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
  export function checkKeyLocator(si: SigInfo|undefined, name: Name) {
    if (!si || !(si.keyLocator instanceof Name) || !name.equals(si.keyLocator)) {
      throw new Error(`KeyLocator does not match key ${name}`);
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
