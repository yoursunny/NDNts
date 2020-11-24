import { SigType, Verifier } from "@ndn/packet";
import { fromHex, toHex } from "@ndn/tlv";
import * as asn1 from "@yoursunny/asn1";

import { crypto } from "../crypto_node";
import type { CryptoAlgorithm, SigningAlgorithm } from "../key/mod";

const SignVerifyParams: EcdsaParams = { name: "ECDSA", hash: "SHA-256" };

function makeGenParams(curve: EcCurve): EcKeyGenParams&EcKeyImportParams {
  return { name: "ECDSA", namedCurve: curve };
}

const PointSizes = {
  "P-256": 32,
  "P-384": 48,
  "P-521": 66,
};

const NamedCurveOids: Record<string, EcCurve|undefined> = {
  "2A8648CE3D030107": "P-256", // 1.2.840.10045.3.1.7
  "2B81040022": "P-384", // 1.3.132.0.34
  "2B81040023": "P-521", // 1.3.132.0.35
};

export type EcCurve = keyof typeof PointSizes;

export namespace EcCurve {
  export const Default: EcCurve = "P-256";
  export const Choices = Object.keys(PointSizes) as readonly EcCurve[];
}

function determineEcCurve(der: asn1.ElementBuffer): EcCurve|false {
  const params = der.children?.[0]?.children?.[1];
  if (params && params.type === 0x06 && params.value) {
    const namedCurveOid = toHex(params.value);
    const curve = NamedCurveOids[namedCurveOid];
    if (curve) {
      return curve;
    }
    /* istanbul ignore next */
    throw new Error(`unknown namedCurve OID ${namedCurveOid}`);
  }
  // Some older certificates are using specifiedCurve.
  // https://redmine.named-data.net/issues/5037
  return false;
}

async function importNamedCurve(curve: EcCurve, spki: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey("spki", spki, makeGenParams(curve), true, ECDSA.keyUsages.public);
}

async function importSpecificCurve(curve: EcCurve, der: asn1.ElementBuffer): Promise<CryptoKey> {
  const subjectPublicKey = der.children?.[1];
  if (!subjectPublicKey || subjectPublicKey.type !== 0x03) {
    throw new Error("subjectPublicKey not found");
  }
  return crypto.subtle.importKey("raw", subjectPublicKey.value!,
    makeGenParams(curve), true, ECDSA.keyUsages.public);
}

function toUintHex(array: Uint8Array, start: number, end: number): string {
  let msb: number;
  for (msb = start; msb < end; ++msb) {
    if (array[msb]) {
      break;
    }
  }
  return toHex(array.slice(msb, end));
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
    let pair: CryptoKeyPair;
    if (importPkcs8) {
      const [pkcs8, spki] = importPkcs8;
      const [privateKey, publicKey] = await Promise.all([
        crypto.subtle.importKey("pkcs8", pkcs8, params, extractable, this.keyUsages.private),
        importNamedCurve(curve, spki),
      ]);
      pair = { privateKey, publicKey };
    } else {
      pair = await crypto.subtle.generateKey(params, extractable,
        [...this.keyUsages.private, ...this.keyUsages.public]);
    }

    const spki = new Uint8Array(await crypto.subtle.exportKey("spki", pair.publicKey));
    return {
      ...pair,
      jwkImportParams: params,
      spki,
      info: { curve },
    };
  },

  async importSpki(spki: Uint8Array, der: asn1.ElementBuffer) {
    // SubjectPublicKeyInfo.algorithm.algorithm == 1.2.840.10045.2.1
    const algo = der.children?.[0]?.children?.[0];
    if (!(algo && algo.type === 0x06 && algo.value && toHex(algo.value) === "2A8648CE3D0201")) {
      throw new Error("not ECDSA key");
    }

    let curve = determineEcCurve(der);
    let publicKey: CryptoKey;
    if (curve) {
      publicKey = await importNamedCurve(curve, spki);
    } else {
      curve = EcCurve.Default;
      publicKey = await importSpecificCurve(curve, der);
    }
    return {
      publicKey,
      spki,
      info: { curve },
    };
  },

  makeLLSign({ privateKey, info: { curve } }: CryptoAlgorithm.PrivateKey<ECDSA.Info>) {
    return async (input) => {
      const raw = new Uint8Array(await crypto.subtle.sign(SignVerifyParams, privateKey, input));
      const pointSize = PointSizes[curve];
      return fromHex(asn1.Any("30",
        asn1.UInt(toUintHex(raw, 0, pointSize)),
        asn1.UInt(toUintHex(raw, pointSize, 2 * pointSize)),
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
    curve?: EcCurve;

    /**
     * Import PKCS#8 private key and SPKI public key instead of generating.
     * This cannot handle specificCurve in SPKI.
     */
    importPkcs8?: [Uint8Array, Uint8Array];
  }

  export interface Info {
    curve: EcCurve;
  }
}
