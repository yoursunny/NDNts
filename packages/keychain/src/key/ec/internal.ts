import { ASN1Construction, ASN1TagClass, ASN1UniversalType, DERElement } from "asn1-ts";

import { EcCurve } from ".";

// tslint:disable-next-line:object-literal-sort-keys
export const SIGN_PARAMS = { name: "ECDSA", hash: "SHA-256" } as EcdsaParams;

const mapPointSize: Record<EcCurve, number> = {
  "P-256": 32,
  "P-384": 48,
  "P-521": 66,
};

export function sigRawToDer(raw: Uint8Array, curve: EcCurve): Uint8Array {
  const pointSize = mapPointSize[curve];
  /* istanbul ignore if */
  if (raw.length !== pointSize * 2) {
    throw new Error("unexpected raw signature length");
  }

  const sequenceEl = new DERElement();
  sequenceEl.sequence = [
    new DERElement(ASN1TagClass.universal, ASN1Construction.primitive, ASN1UniversalType.integer,
                   raw.subarray(0, pointSize)),
    new DERElement(ASN1TagClass.universal, ASN1Construction.primitive, ASN1UniversalType.integer,
                   raw.subarray(pointSize)),
  ];
  return sequenceEl.toBytes();
}

export function sigDerToRaw(asn1: Uint8Array, curve: EcCurve): Uint8Array {
  const sequenceEl = new DERElement();
  sequenceEl.fromBytes(asn1);
  const [{ octetString: r }, { octetString: s }] = sequenceEl.sequence;

  const pointSize = mapPointSize[curve];
  const raw = new Uint8Array(pointSize * 2);
  writeIntergerFixed(raw, 0, pointSize, r);
  writeIntergerFixed(raw, pointSize, pointSize, s);
  return raw;
}

function writeIntergerFixed(dst: Uint8Array, offset: number, length: number, src: Uint8Array) {
  if (src.length > length) {
    /* istanbul ignore if */
    if (src.subarray(0, src.length - length).filter((b) => b > 0).length > 0) {
      throw new Error("non-zero padding");
    }
    dst.set(src.subarray(src.length - length), offset);
  } else {
    dst.set(src, offset + length - src.length);
  }
}
