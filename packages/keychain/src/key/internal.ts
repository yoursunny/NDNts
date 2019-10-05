import { KeyLocator, LLSign, LLVerify, SigInfo } from "@ndn/l3pkt";
import { Name } from "@ndn/name";

import { KeyName } from "../name";

interface PacketWithSignature {
  sigInfo?: SigInfo;
  sigValue?: Uint8Array;
}

type Signable = LLSign.Signable & PacketWithSignature;
type Verifiable = LLVerify.Verifiable & Readonly<PacketWithSignature>;

const ISKEY = Symbol("KeyChain.IsKey");

class NamedKey {
  public readonly [ISKEY] = ISKEY;

  constructor(public readonly name: Name, public readonly sigType: number,
              public readonly keyLocator: KeyLocator|undefined) {
  }
}

/** Determine if obj is a private/public key. */
export function isKey(obj: any): obj is NamedKey {
  return !!obj && obj[ISKEY] === ISKEY;
}

/** Named private key. */
export abstract class PrivateKeyBase extends NamedKey {
  /** Sign the packet. */
  public sign(pkt: Signable): void {
    const si = pkt.sigInfo || new SigInfo();
    si.type = this.sigType;
    si.keyLocator = this.keyLocator;
    pkt.sigInfo = si;
    pkt[LLSign.PENDING] = (input) => this.llSign(input);
  }

  protected abstract llSign(input: Uint8Array): Promise<Uint8Array>;
}

/** Named public key. */
export abstract class PublicKeyBase extends NamedKey {
  /** Determine whether a packet was signed by this public key. */
  public match(pkt: PacketWithSignature): boolean {
    return !!pkt.sigInfo && pkt.sigInfo.type === this.sigType && this.doMatch(pkt.sigInfo);
  }

  /** Verify the signature on a packet. */
  public verify(pkt: Verifiable): Promise<void> {
    return pkt[LLVerify.VERIFY]((input, sig) => this.llVerify(input, sig));
  }

  protected abstract doMatch(si: SigInfo): boolean;

  protected abstract llVerify(input: Uint8Array, sig: Uint8Array): Promise<void>;
}

export namespace PublicKeyBase {
  /** Throw "incorrect signature" error if ok=false. */
  export function throwOnIncorrectSig(ok: boolean): void {
    if (!ok) {
      throw new Error("incorrect signature");
    }
  }

  export interface SpkiExportable extends PublicKeyBase {
    exportAsSpki(): Promise<Uint8Array>;
  }
}

export const KEYGEN = Symbol("KeyChain.KeyGen");

export interface KeyGenResult {
  privateKey: PrivateKeyBase;
  privateKeyExported: object;
  publicKey: PublicKeyBase.SpkiExportable;
}

export interface KeyGenerator<A extends any[]> {
  [KEYGEN](name: KeyName, needJson: boolean, ...args: A): Promise<KeyGenResult>;
}
