import { toHex } from "@ndn/util";
import type * as asn1 from "@yoursunny/asn1";

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
