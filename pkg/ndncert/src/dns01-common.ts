import { sha256, toUtf8 } from "@ndn/util";
// @ts-expect-error no types
import { toBase64Url } from "b64u-lite";

export function toRecordName(domain: string): string {
  return `_ndncert-challenge.${domain}`;
}

export async function computeRecordValue(token: string, requesterPublicKey: Uint8Array): Promise<string> {
  const pubHash = toBase64Url(await sha256(requesterPublicKey));
  const keyAuthorization = `${token}.${pubHash}`;
  return toBase64Url(await sha256(toUtf8(keyAuthorization)));
}
