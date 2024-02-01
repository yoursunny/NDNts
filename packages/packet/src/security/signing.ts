import { assert, sha256, timingSafeEqual } from "@ndn/util";

import { SigType } from "../an";
import { KeyLocator } from "../key-locator";
import type { Name } from "../name/mod";
import { SigInfo } from "../sig-info";

/**
 * Low level signing function.
 * @param input - Buffer of signed portion.
 * @returns Promise resolves to signature value or rejects with error.
 */
export type LLSign = (input: Uint8Array) => Promise<Uint8Array>;

export namespace LLSign {
  export const OP = Symbol("@ndn/packet#LLSign.OP");

  /** Target packet compatible with low level signing function. */
  export interface Signable {
    [OP](signer: LLSign): Promise<void>;
  }
}

/**
 * Low level verification function.
 * @param input - Buffer of signed portion.
 * @param sig - Buffer of signature value.
 * @returns Promise resolves upon good signature or rejects upon bad signature.
 */
export type LLVerify = (input: Uint8Array, sig: Uint8Array) => Promise<void>;

export namespace LLVerify {
  export const OP = Symbol("@ndn/packet#LLVerify.OP");

  /** Target packet compatible with low level verification function. */
  export interface Verifiable {
    [OP](verifier: LLVerify): Promise<void>;
  }
}

interface PacketWithSignature {
  readonly name: Name;
  sigInfo?: SigInfo;
  sigValue: Uint8Array;
}

/** High level signer, such as a named private key. */
export interface Signer {
  /** Sign a packet. */
  sign(pkt: Signer.Signable): Promise<void>;
}

export namespace Signer {
  /** Target packet compatible with high level signer. */
  export interface Signable extends PacketWithSignature, LLSign.Signable {}

  /**
   * Put SigInfo on packet if it does not exist.
   * @param pkt - Target packet.
   * @param sigType - Optionally set sigType.
   * @param keyLocator - Optionally set keyLocator; `false` to delete KeyLocator.
   * @returns Existing or modified SigInfo.
   */
  export function putSigInfo(pkt: PacketWithSignature, sigType?: number, keyLocator?: KeyLocator.CtorArg | false): SigInfo {
    pkt.sigInfo ??= new SigInfo();
    if (sigType !== undefined) {
      pkt.sigInfo.type = sigType;
    }
    if (keyLocator === false) {
      pkt.sigInfo.keyLocator = undefined;
    } else if (keyLocator !== undefined) {
      pkt.sigInfo.keyLocator = new KeyLocator(keyLocator);
    }
    return pkt.sigInfo;
  }
}

/** High level verifier, such as a named public key. */
export interface Verifier {
  /**
   * Verify a packet.
   * @returns Promise resolves upon good signature/policy or rejects upon bad signature/policy.
   */
  verify(pkt: Verifier.Verifiable): Promise<void>;
}

export namespace Verifier {
  /** Target packet compatible with high level verifier. */
  export interface Verifiable extends Readonly<PacketWithSignature>, LLVerify.Verifiable {}

  /**
   * Ensure packet has the correct SigType.
   *
   * @throws Error
   * Thrown if `pkt` lacks SigInfo or its SigType differs from `expectedSigType`.
   */
  export function checkSigType(pkt: Readonly<PacketWithSignature>, expectedSigType: number) {
    assert(pkt.sigInfo?.type === expectedSigType, `packet does not have SigType ${expectedSigType}`);
  }

  /** Throw bad signature error if not OK. */
  export function throwOnBadSig(ok: boolean): asserts ok {
    assert(ok, "bad signature value");
  }
}

/** Signer and Verifier that do nothing. */
export const noopSigning: Signer & Verifier = {
  sign() {
    return Promise.resolve();
  },
  verify() {
    return Promise.resolve();
  },
};

/** Signer and Verifier for SigType.Sha256 digest. */
export const digestSigning: Signer & Verifier = {
  sign(pkt: Signer.Signable): Promise<void> {
    Signer.putSigInfo(pkt, SigType.Sha256, false);
    return pkt[LLSign.OP]((input) => sha256(input));
  },

  async verify(pkt: Verifier.Verifiable): Promise<void> {
    Verifier.checkSigType(pkt, SigType.Sha256);
    return pkt[LLVerify.OP](async (input, sig) => {
      const h = await sha256(input);
      const ok = timingSafeEqual(sig, h);
      Verifier.throwOnBadSig(ok);
    });
  },
};

/**
 * Signer for SigType.Null, a packet that is not signed.
 * @see https://redmine.named-data.net/projects/ndn-tlv/wiki/NullSignature
 */
export const nullSigner: Signer = {
  sign(pkt: Signer.Signable): Promise<void> {
    Signer.putSigInfo(pkt, SigType.Null, false);
    pkt.sigValue = new Uint8Array();
    return Promise.resolve();
  },
};
