import { Name, SigType, Verifier } from "@ndn/packet";
import { toHex } from "@ndn/tlv";
import * as asn1 from "@root/asn1";

import { PublicKey } from "../base";
import { crypto } from "../crypto_node";
import { EC_POINT_SIZE, EcCurve, makeGenParams, SIGN_PARAMS } from "./algo";

/** ECDSA public key. */
export class EcPublicKey extends PublicKey implements PublicKey.Exportable {
  constructor(name: Name, public readonly curve: EcCurve, public readonly key: CryptoKey) {
    super(name, SigType.Sha256WithEcdsa);
  }

  protected async llVerify(input: Uint8Array, sig: Uint8Array): Promise<void> {
    const pointSize = EC_POINT_SIZE[this.curve];

    const der = asn1.parseVerbose(sig);
    const r = der.children?.[0].value;
    const s = der.children?.[1].value;
    if (!r || !s || r.byteLength > pointSize || s.byteLength > pointSize) {
      Verifier.throwOnBadSig(false);
    }

    const raw = new Uint8Array(2 * pointSize);
    raw.set(r, pointSize - r.byteLength);
    raw.set(s, 2 * pointSize - s.byteLength);

    const ok = await crypto.subtle.verify(SIGN_PARAMS, this.key, raw, input);
    Verifier.throwOnBadSig(ok);
  }

  public async exportAsSpki(): Promise<Uint8Array> {
    const spki = await crypto.subtle.exportKey("spki", this.key);
    return new Uint8Array(spki);
  }
}

function determineEcCurve(der: asn1.ElementBuffer): EcCurve|false {
  const params = der.children?.[0].children?.[1];
  if (params && params.type === 0x06 && params.value) {
    const namedCurveOid = toHex(params.value);
    switch (namedCurveOid) {
      case "2A8648CE3D030107": // 1.2.840.10045.3.1.7
        return "P-256";
      case "2B81040022": // 1.3.132.0.34
        return "P-384";
      case "2B81040023": // 1.3.132.0.35
        return "P-521";
    }
    /* istanbul ignore next */
    throw new Error(`unknown namedCurve OID ${namedCurveOid}`);
  }
  // Some older certificates are using specifiedCurve.
  // https://redmine.named-data.net/issues/5037
  return false;
}

async function importNamedCurve(curve: EcCurve, spki: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey("spki", spki, makeGenParams(curve), true, ["verify"]);
}

async function importSpecificCurve(curve: EcCurve, der: asn1.ElementBuffer): Promise<CryptoKey> {
  const subjectPublicKey = der.children?.[1];
  if (!subjectPublicKey || subjectPublicKey.type !== 0x03) {
    throw new Error("subjectPublicKey not found");
  }
  return crypto.subtle.importKey("raw", subjectPublicKey.value!,
    makeGenParams(curve), true, ["verify"]);
}

export namespace EcPublicKey {
  export async function importSpki(name: Name, spki: Uint8Array, der: asn1.ElementBuffer): Promise<EcPublicKey> {
    let curve = determineEcCurve(der);
    let key: CryptoKey;
    if (curve) {
      key = await importNamedCurve(curve, spki);
    } else {
      curve = "P-256";
      key = await importSpecificCurve(curve, der);
    }
    return new EcPublicKey(name, curve, key);
  }
}
