import { Name } from "@ndn/name";
import { ASN1UniversalType, DERElement } from "asn1-ts";

import { crypto } from "../platform";
import { EcCurve, EcPrivateKey, EcPublicKey } from "./ec";
import { StoredKey } from "./internal";
import { PublicKey } from "./public-key";
import { RsaPrivateKey, RsaPublicKey } from "./rsa";
import { IMPORT_PARAMS as rsaImportParams } from "./rsa/internal";

export async function loadFromStored(name: Name, stored: StoredKey) {
  switch (stored.type) {
    case "EC":
      return EcPrivateKey.loadFromStored(name, stored);
    case "RSA":
      return RsaPrivateKey.loadFromStored(name, stored);
  }
  throw new Error(`unknown stored type ${stored.type}`);
}

export async function importSpki(name: Name, spki: Uint8Array): Promise<PublicKey> {
  const spkiEl = new DERElement();
  spkiEl.fromBytes(spki);
  const [algoIdEl] = spkiEl.sequence;
  const [algoEl, paramsEl] = algoIdEl.sequence;
  const algoOid = algoEl.objectIdentifier;

  switch (algoOid.dotDelimitedNotation) {
    case "1.2.840.10045.2.1": {
      const namedCurve = determineEcCurve(paramsEl);
      const key = await crypto.subtle.importKey("spki", spki,
        { name: "ECDSA", namedCurve }, true, ["verify"]);
      return new EcPublicKey(name, namedCurve, key);
    }
    case "1.2.840.113549.1.1.1": {
      const key = await crypto.subtle.importKey("spki", spki,
        rsaImportParams, true, ["verify"]);
      return new RsaPublicKey(name, key);
    }
  }
  /* istanbul ignore next */
  throw new Error("invalid SPKI or unknown algorithm");
}

function determineEcCurve(paramsEl: DERElement): EcCurve {
  if (paramsEl.tagNumber === ASN1UniversalType.objectIdentifier) {
    const namedCurveOid = paramsEl.objectIdentifier;
    switch (namedCurveOid.dotDelimitedNotation) {
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
