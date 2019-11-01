import { ASN1Construction, ASN1TagClass, ASN1UniversalType, DERElement } from "asn1-ts";

import { EcCurve } from ".";

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

  const sequenceEl = new DERElement(
    ASN1TagClass.universal,
    undefined,
    ASN1UniversalType.sequence,
  );
  sequenceEl.sequence = [
    writeIntegerDer(raw.subarray(0, pointSize)),
    writeIntegerDer(raw.subarray(pointSize)),
  ];
  return sequenceEl.toBytes();
}

function writeIntegerDer(n: Uint8Array): DERElement {
  let value = n;
  if (n[0] >= 0x80) {
    value = Uint8Array.of(0, ...n);
  } else {
    for (let i = 0; i < n.length - 1; ++i) {
      if ((n[i] << 1) + (n[i + 1] >> 7) !== 0) {
        value = n.subarray(i);
        break;
      }
    }
  }
  return  new DERElement(
    ASN1TagClass.universal,
    ASN1Construction.primitive,
    ASN1UniversalType.integer,
    value,
  );
}

export function sigDerToRaw(asn1: Uint8Array, curve: EcCurve): Uint8Array {
  const sequenceEl = new DERElement();
  sequenceEl.fromBytes(asn1);
  const [{ octetString: r }, { octetString: s }] = sequenceEl.sequence;

  const pointSize = mapPointSize[curve];
  const raw = new Uint8Array(pointSize * 2);
  writeIntegerFixed(raw, 0, pointSize, r);
  writeIntegerFixed(raw, pointSize, pointSize, s);
  return raw;
}

function writeIntegerFixed(dst: Uint8Array, offset: number, length: number, src: Uint8Array) {
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
