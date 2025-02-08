import { createPrivateKey } from "node:crypto";

import { ECDSA, Ed25519, RSA, type SigningAlgorithm } from "@ndn/keychain";
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
    case SigType.Sha256WithRsa: {
      const k = createPrivateKey({ key: Buffer.from(secret), format: "der", type: "pkcs1" });
      return [RSA, {
        importPkcs8: [k.export({ format: "der", type: "pkcs8" }), spki],
      } satisfies RSA.GenParams];
    }
    case SigType.Sha256WithEcdsa: {
      const k = createPrivateKey({ key: Buffer.from(secret), format: "der", type: "sec1" });
      return [ECDSA, {
        importPkcs8: [k.export({ format: "der", type: "pkcs8" }), spki],
      } satisfies ECDSA.GenParams];
    }
    default: {
      throw new Error(`unsupported SigType ${sigType}`);
    }
  }
}
