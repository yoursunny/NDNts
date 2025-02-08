import { Certificate } from "@ndn/keychain";
import { Data } from "@ndn/packet";
import { Decoder } from "@ndn/tlv";

import { UnencryptedPrivateKey } from "./private-key";

function decodePem(input: string): Data {
  const matches = input.match(/^[A-Za-z\d+/=]+\s*$/gm);
  const wire = Uint8Array.from(globalThis.atob(matches!.join("")), (b) => b.codePointAt(0)!);
  return Decoder.decode(wire, Data);
}

/**
 * Parse PEM-encoded unencrypted private key.
 * @param input - *.key file content.
 */
export function parseKey(input: string): UnencryptedPrivateKey {
  const data = decodePem(input);
  return new UnencryptedPrivateKey(data);
}

/**
 * Parse PEM-encoded certificate.
 * @param input - *.cert file content.
 */
export function parseCert(input: string): Certificate {
  const data = decodePem(input);
  return Certificate.fromData(data);
}
