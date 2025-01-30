import { SigType, Verifier } from "@ndn/packet";
import { fromHex, toHex } from "@ndn/util";
import * as asn1 from "@yoursunny/asn1";

import type { CryptoAlgorithm, SigningAlgorithm } from "../key/mod";
import { assertSpkiAlgorithm } from "./impl-spki";

const SignVerifyParams: EcdsaParams = { name: "ECDSA", hash: "SHA-256" };

function makeGenParams(curve: EcCurve): EcKeyGenParams & EcKeyImportParams {
  return { name: "ECDSA", namedCurve: curve };
}

const PointSizes = {
  "P-256": 32,
  "P-384": 48,
  "P-521": 66,
} as const;

const NamedCurveOids: Record<string, EcCurve> = {
  "2A8648CE3D030107": "P-256", // 1.2.840.10045.3.1.7
  "2B81040022": "P-384", // 1.3.132.0.34
  "2B81040023": "P-521", // 1.3.132.0.35
};

export type EcCurve = keyof typeof PointSizes;
export namespace EcCurve {
  export const Default: EcCurve = "P-256";
  export const Choices = Object.keys(PointSizes) as readonly EcCurve[];
}

function toUintHex(array: Uint8Array): string {
  let msb: number;
  for (msb = 0; msb < array.byteLength - 1; ++msb) {
    if (array[msb]) {
      break;
    }
  }
  return toHex(array.subarray(msb));
}

/** Sha256WithEcdsa signing algorithm. */
export const ECDSA: SigningAlgorithm<ECDSA.Info, true, ECDSA.GenParams> = {
  uuid: "a81b3696-65e5-4f4c-bb45-14125472321b",
  sigType: SigType.Sha256WithEcdsa,
  keyUsages: {
    private: ["sign"],
    public: ["verify"],
  },

  async cryptoGenerate({ curve = EcCurve.Default, importPkcs8 }: ECDSA.GenParams, extractable: boolean) {
    const params = makeGenParams(curve);
    let privateKey: CryptoKey;
    let publicKey: CryptoKey;
    if (importPkcs8) {
      const [pkcs8, spki] = importPkcs8;
      [privateKey, publicKey] = await Promise.all([
        crypto.subtle.importKey("pkcs8", pkcs8, params, extractable, this.keyUsages.private),
        crypto.subtle.importKey("spki", spki, params, true, this.keyUsages.public),
      ]);
    } else {
      ({ privateKey, publicKey } = await crypto.subtle.generateKey(params, extractable,
        [...this.keyUsages.private, ...this.keyUsages.public]));
    }

    const spki = new Uint8Array(await crypto.subtle.exportKey("spki", publicKey));
    return {
      privateKey,
      publicKey,
      jwkImportParams: params,
      spki,
      info: { curve },
    };
  },

  async importSpki(spki: Uint8Array, der: asn1.ElementBuffer) {
    assertSpkiAlgorithm(der, "ECDSA", "2A8648CE3D0201"); // 1.2.840.10045.2.1

    // SubjectPublicKeyInfo.algorithm.parameter
    const ecp = der.children?.[0]?.children?.[1];
    const curve = ecp?.type === 0x06 && ecp.value && NamedCurveOids[toHex(ecp.value)];
    if (!curve) {
      throw new Error("invalid EC namedCurve");
    }

    const params = makeGenParams(curve);
    const publicKey = await crypto.subtle.importKey("spki", spki, params, true, this.keyUsages.public);
    return {
      publicKey,
      spki,
      info: { curve },
    };
  },

  makeLLSign({ privateKey, info: { curve } }: CryptoAlgorithm.PrivateKey<ECDSA.Info>) {
    return async (input) => {
      const raw = await crypto.subtle.sign(SignVerifyParams, privateKey, input);
      const pointSize = PointSizes[curve];
      return fromHex(asn1.Any("30",
        asn1.UInt(toUintHex(new Uint8Array(raw, 0, pointSize))),
        asn1.UInt(toUintHex(new Uint8Array(raw, pointSize))),
      ));
    };
  },

  makeLLVerify({ publicKey, info: { curve } }: CryptoAlgorithm.PublicKey<ECDSA.Info>) {
    return async (input, sig) => {
      const pointSize = PointSizes[curve];

      const der = asn1.parseVerbose(sig);
      const r = der.children?.[0]?.value;
      const s = der.children?.[1]?.value;
      if (!r || !s || r.byteLength > pointSize || s.byteLength > pointSize) {
        Verifier.throwOnBadSig(false);
      }

      const raw = new Uint8Array(2 * pointSize);
      raw.set(r, pointSize - r.byteLength);
      raw.set(s, 2 * pointSize - s.byteLength);

      const ok = await crypto.subtle.verify(SignVerifyParams, publicKey, raw, input);
      Verifier.throwOnBadSig(ok);
    };
  },
};

export namespace ECDSA {
  /** Key generation parameters. */
  export interface GenParams {
    /**
     * EC curve.
     * @defaultValue P-256
     */
    curve?: EcCurve;

    /** Import PKCS#8 private key and SPKI public key instead of generating. */
    importPkcs8?: [pkcs8: Uint8Array, spki: Uint8Array];
  }

  export interface Info {
    curve: EcCurve;
  }
}
