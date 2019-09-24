import { createHash } from "crypto";

export async function sha256(input: Uint8Array): Promise<Uint8Array> {
  const hash = createHash("sha256");
  hash.update(input);
  const d = hash.digest();
  return new Uint8Array(d.buffer, d.byteOffset, d.byteLength);
}
