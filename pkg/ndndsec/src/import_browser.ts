import { Ed25519, type SigningAlgorithm } from "@ndn/keychain";
import { SigType } from "@ndn/packet";

export async function toImportParams(
    sigType: number,
    secret: Uint8Array,
    spki: Uint8Array,
): Promise<[algo: SigningAlgorithm, genParams: any]> {
  switch (sigType) {
    case SigType.Ed25519: {
      return [Ed25519, {
        importPkcs8: [secret, spki],
      } satisfies Ed25519.GenParams];
    }
    default: {
      throw new Error(`unsupported SigType ${sigType}`);
    }
  }
}
