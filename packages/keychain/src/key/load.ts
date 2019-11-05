import { Name } from "@ndn/name";
import { DERElement } from "asn1-ts";

import { EcPrivateKey, EcPublicKey, PublicKey, RsaPrivateKey, RsaPublicKey } from ".";
import { HmacKey } from "./hmac";
import { PrivateKey } from "./private-key";
import { StoredKey } from "./save";

export async function loadFromStored(name: Name, stored: StoredKey): Promise<[PrivateKey, PublicKey]> {
  switch (stored.type) {
    case EcPrivateKey.STORED_TYPE:
      return EcPrivateKey.loadFromStored(name, stored);
    case RsaPrivateKey.STORED_TYPE:
      return RsaPrivateKey.loadFromStored(name, stored);
    case HmacKey.STORED_TYPE:
      return HmacKey.loadFromStored(name, stored);
  }
  throw new Error(`unknown stored type ${stored.type}`);
}

export async function loadSpki(name: Name, spki: Uint8Array): Promise<PublicKey> {
  const der = new DERElement();
  der.fromBytes(spki);
  const {
    sequence: [
      { sequence: [{ objectIdentifier: { dotDelimitedNotation: algoOid } }] },
    ],
  } = der;

  switch (algoOid) {
    case "1.2.840.10045.2.1":
      return EcPublicKey.importSpki(name, spki, der);
    case "1.2.840.113549.1.1.1":
      return RsaPublicKey.importSpki(name, spki);
  }
  /* istanbul ignore next */
  throw new Error(`unknown algorithm ${algoOid}`);
}
