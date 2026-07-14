import { fromHex, toHex } from "@ndn/util";
import * as asn1 from "@yoursunny/asn1";

/**
 * Require SubjectPublicKeyInfo.algorithm.algorithm to have specific OID.
 * @param der - SubjectPublicKeyInfo.
 * @param algoName - Textual algorithm name.
 * @param oid - OID hex string (upper case).
 */
export function assertSpkiAlgorithm(der: asn1.ElementBuffer, algoName: string, oid: string): void {
  const algo = der.children?.[0]?.children?.[0];
  if (algo?.type === 0x06 && algo.value && toHex(algo.value) === oid) {
    return;
  }
  throw new Error(`not ${algoName} public key`);
}

/**
 * Convert to ASN.1 PrivateKeyInfo (PKCS#8) format.
 * @param privateKeyAlgorithm - AlgorithmIdentifier elements.
 * @param privateKey - Value of private key.
 * @returns PKCS#8 buffer.
 */
export function toPkcs8(privateKeyAlgorithm: string[], privateKey: Uint8Array): Uint8Array {
  // https://datatracker.ietf.org/doc/html/rfc5208#section-5
  return fromHex(asn1.Any(
    "30", // PrivateKeyInfo
    asn1.UInt("00"), // Version 0
    asn1.Any( // PrivateKeyAlgorithmIdentifier
      "30",
      ...privateKeyAlgorithm,
    ),
    asn1.Any("04", toHex(privateKey)), // PrivateKey
  ));
}
