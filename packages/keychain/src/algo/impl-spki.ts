import { toHex } from "@ndn/util";
import type * as asn1 from "@yoursunny/asn1";

/** Extract SubjectPublicKeyInfo.algorithm.algorithm field as OID. */
export function extractSpkiAlgorithm(der: asn1.ElementBuffer): string | undefined {
  const algo = der.children?.[0]?.children?.[0];
  return algo?.type === 0x06 && algo.value ? toHex(algo.value) : undefined;
}
