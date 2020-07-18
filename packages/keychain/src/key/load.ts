import { Name } from "@ndn/packet";
import { toHex } from "@ndn/tlv";
import * as asn1 from "@yoursunny/asn1";

import { HmacKey } from "./hmac/mod";
import { EcPrivateKey, EcPublicKey, PublicKey, RsaPrivateKey, RsaPublicKey } from "./mod";
import { LoadedKey, StoredKey } from "./save";

export async function loadFromStored(name: Name, stored: StoredKey, extractable = false): Promise<LoadedKey> {
  switch (stored.type) {
    case EcPrivateKey.STORED_TYPE:
      return EcPrivateKey.loadFromStored(name, stored, extractable);
    case RsaPrivateKey.STORED_TYPE:
      return RsaPrivateKey.loadFromStored(name, stored, extractable);
    case HmacKey.STORED_TYPE:
      return HmacKey.loadFromStored(name, stored, extractable);
  }
  throw new Error(`unknown stored type ${stored.type}`);
}

export async function loadSpki(name: Name, spki: Uint8Array): Promise<PublicKey> {
  const der = asn1.parseVerbose(spki);
  const algo = der.children?.[0].children?.[0];
  if (!(algo && algo.type === 0x06 && algo.value)) {
    throw new Error("SubjectPublicKeyInfo.algorithm.algorithm not found");
  }
  const algoOid = toHex(algo.value);
  switch (algoOid) {
    case "2A8648CE3D0201": // 1.2.840.10045.2.1
      return EcPublicKey.importSpki(name, spki, der);
    case "2A864886F70D010101": // 1.2.840.113549.1.1.1
      return RsaPublicKey.importSpki(name, spki);
  }
  /* istanbul ignore next */
  throw new Error(`unknown algorithm ${algoOid}`);
}
