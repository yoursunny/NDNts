import { createHash } from "crypto";

export async function sha256(input: Uint8Array): Promise<Uint8Array> {
  const hash = createHash("sha256");
  hash.update(input);
  return hash.digest();
}
