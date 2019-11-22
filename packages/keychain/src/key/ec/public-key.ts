import { Name, SigInfo, SigType } from "@ndn/packet";
import { ASN1UniversalType, DERElement } from "asn1-ts";

import { crypto } from "../platform/mod";
import { PublicKeyBase } from "../public-key";
import { makeGenParams, sigDerToRaw, SIGN_PARAMS } from "./internal";
import { EcCurve } from "./mod";

/** ECDSA public key. */
export class EcPublicKey extends PublicKeyBase {
  constructor(name: Name, public readonly curve: EcCurve, public readonly key: CryptoKey) {
    super(name, SigType.Sha256WithEcdsa, name);
  }

  public async exportAsSpki(): Promise<Uint8Array> {
    const spki = await crypto.subtle.exportKey("spki", this.key);
    return new Uint8Array(spki);
  }

  protected doMatch(si: SigInfo): boolean {
    // TODO match KeyDigest
    return si.keyLocator instanceof Name && si.keyLocator.isPrefixOf(this.name);
  }

  protected async llVerify(input: Uint8Array, sig: Uint8Array): Promise<void> {
    const rawSig = sigDerToRaw(sig, this.curve);
    const ok = await crypto.subtle.verify(SIGN_PARAMS, this.key, rawSig, input);
    PublicKeyBase.throwOnIncorrectSig(ok);
  }
}

function determineEcCurve(der: DERElement): EcCurve {
  const {
    sequence: [
      { sequence: [, paramsDer] },
    ],
  } = der;

  if (paramsDer.tagNumber === ASN1UniversalType.objectIdentifier) {
    const namedCurveOid = paramsDer.objectIdentifier.dotDelimitedNotation;
    switch (namedCurveOid) {
      case "1.2.840.10045.3.1.7":
        return "P-256";
      case "1.3.132.0.34":
        return "P-384";
      case "1.3.132.0.35":
        return "P-521";
    }
    /* istanbul ignore next */
    throw new Error(`unknown namedCurve OID ${namedCurveOid}`);
  }

  // Some certificates are using specifiedCurve. Assume they are P-256.
  return "P-256";
}

export namespace EcPublicKey {
  export async function importSpki(name: Name, spki: Uint8Array, der: DERElement): Promise<EcPublicKey> {
    const curve = determineEcCurve(der);
    const key = await crypto.subtle.importKey("spki", spki, makeGenParams(curve), true, ["verify"]);
    return new EcPublicKey(name, curve, key);
  }
}
