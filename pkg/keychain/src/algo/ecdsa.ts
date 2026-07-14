import { SigType, Verifier } from "@ndn/packet";
import { asBufferSource, assert, fromHex, toHex } from "@ndn/util";
import * as asn1 from "@yoursunny/asn1";

import type { CryptoAlgorithm, SigningAlgorithm } from "../key/mod";
import { assertSpkiAlgorithm, toPkcs8 } from "./impl-asn1";

const SignVerifyParams: EcdsaParams = { name: "ECDSA", hash: "SHA-256" };

function makeGenParams(curve: EcCurve): EcKeyGenParams & EcKeyImportParams {
  return { name: "ECDSA", namedCurve: curve };
}

const EcPublicKeyOid = "2A8648CE3D0201"; // 1.2.840.10045.2.1

const NamedCurveInfo = {
  "P-256": [32, "2A8648CE3D030107"], // 1.2.840.10045.3.1.7
  "P-384": [48, "2B81040022"], // 1.3.132.0.34
  "P-521": [66, "2B81040023"], // 1.3.132.0.35
} as const;

const NamedCurveOids: Record<string, EcCurve> = Object.fromEntries(Object.entries(NamedCurveInfo).map(([curve, [,oid]]) => [oid, curve as EcCurve]));

export type EcCurve = keyof typeof NamedCurveInfo;
export namespace EcCurve {
  export const Default: EcCurve = "P-256";
  export const Choices = Object.keys(NamedCurveInfo) as readonly EcCurve[];

  /** Detect EcCurve from SubjectPublicKeyInfo. */
  export function detectFromSpki(der: asn1.ElementBuffer): EcCurve {
    assertSpkiAlgorithm(der, "ECDSA", EcPublicKeyOid);

    // SubjectPublicKeyInfo.algorithm.parameter
    const ecp = der.children?.[0]?.children?.[1];
    const curve = ecp?.type === 0x06 && ecp.value && NamedCurveOids[toHex(ecp.value)];

    assert(curve, "invalid EC namedCurve");
    return curve;
  }
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

function stripSec1Parameters(input: Uint8Array): Uint8Array {
  // https://datatracker.ietf.org/doc/html/rfc5915#section-3
  // Delete ECParameters field from SEC#1 data.
  const sec1 = asn1.parseVerbose(input);
  let index: number;
  if (sec1.children && (index = sec1.children.findIndex((child) => child.type === 160)) >= 0) {
    sec1.children.splice(index, 1);
  }
  return asn1.pack(sec1);
}

function loadPkcs8(pkcs8: Uint8Array, spki: Uint8Array, curve: EcCurve, extractable: boolean) {
  const params = makeGenParams(curve);
  return Promise.all([
    params, // eslint-disable-line @typescript-eslint/await-thenable
    crypto.subtle.importKey("pkcs8", asBufferSource(pkcs8), params, extractable, ECDSA.keyUsages.private),
    crypto.subtle.importKey("spki", asBufferSource(spki), params, true, ECDSA.keyUsages.public),
  ]);
}

/** Sha256WithEcdsa signing algorithm. */
export const ECDSA: SigningAlgorithm<ECDSA.Info, true, ECDSA.GenParams> = {
  uuid: "a81b3696-65e5-4f4c-bb45-14125472321b",
  sigType: SigType.Sha256WithEcdsa,
  keyUsages: {
    private: ["sign"],
    public: ["verify"],
  },

  async cryptoGenerate({ curve, importPkcs8, importSec1 }: ECDSA.GenParams, extractable: boolean) {
    let params: ReturnType<typeof makeGenParams>;
    let privateKey: CryptoKey;
    let publicKey: CryptoKey;
    if (importPkcs8) {
      const [pkcs8, spki] = importPkcs8;
      curve ??= EcCurve.detectFromSpki(asn1.parseVerbose(spki));
      [params, privateKey, publicKey] = await loadPkcs8(pkcs8, spki, curve, extractable);
    } else if (importSec1) {
      const [sec1, spki] = importSec1;
      curve ??= EcCurve.detectFromSpki(asn1.parseVerbose(spki));
      const pkcs8 = toPkcs8(
        [
          asn1.Any("06", EcPublicKeyOid), // OID
          asn1.Any("06", NamedCurveInfo[curve][1]),
        ],
        stripSec1Parameters(sec1),
      );
      [params, privateKey, publicKey] = await loadPkcs8(pkcs8, spki, curve, extractable);
    } else {
      curve ??= EcCurve.Default;
      params = makeGenParams(curve);
      ({ privateKey, publicKey } = await crypto.subtle.generateKey(
        params, extractable,
        [...this.keyUsages.private, ...this.keyUsages.public],
      ));
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
    const curve = EcCurve.detectFromSpki(der);
    const params = makeGenParams(curve);
    const publicKey = await crypto.subtle.importKey("spki", asBufferSource(spki), params, true, this.keyUsages.public);
    return {
      publicKey,
      spki,
      info: { curve },
    };
  },

  makeLLSign({ privateKey, info: { curve } }: CryptoAlgorithm.PrivateKey<ECDSA.Info>) {
    return async (input) => {
      const raw = await crypto.subtle.sign(SignVerifyParams, privateKey, asBufferSource(input));
      const pointSize = NamedCurveInfo[curve][0];
      return fromHex(asn1.Any(
        "30",
        asn1.UInt(toUintHex(new Uint8Array(raw, 0, pointSize))),
        asn1.UInt(toUintHex(new Uint8Array(raw, pointSize))),
      ));
    };
  },

  makeLLVerify({ publicKey, info: { curve } }: CryptoAlgorithm.PublicKey<ECDSA.Info>) {
    return async (input, sig) => {
      const pointSize = NamedCurveInfo[curve][0];

      const der = asn1.parseVerbose(sig);
      const r = der.children?.[0]?.value;
      const s = der.children?.[1]?.value;
      if (!r || !s || r.byteLength > pointSize || s.byteLength > pointSize) {
        Verifier.throwOnBadSig(false);
      }

      const raw = new Uint8Array(2 * pointSize);
      raw.set(r, pointSize - r.byteLength);
      raw.set(s, 2 * pointSize - s.byteLength);

      const ok = await crypto.subtle.verify(SignVerifyParams, publicKey, raw, asBufferSource(input));
      Verifier.throwOnBadSig(ok);
    };
  },
};

export namespace ECDSA {
  /** Key generation parameters. */
  export interface GenParams {
    /**
     * EC curve.
     *
     * @defaultValue
     * During key generation when {@link importPkcs8} is absent, the default is "P-256".
     * During key import when {@link importPkcs8} is specified, this is auto-detected from SPKI.
     */
    curve?: EcCurve;

    /**
     * Import PKCS#8 private key and SPKI public key instead of generating.
     *
     * If {@link curve} is also specified, it must match the SPKI public key.
     */
    importPkcs8?: [pkcs8: Uint8Array, spki: Uint8Array];

    /**
     * Import SEC#1 private key and SPKI public key instead of generating.
     *
     * If {@link curve} is also specified, it must match the SPKI public key.
     * If {@link importPkcs8} is also specified, this field is ignored.
     */
    importSec1?: [sec1: Uint8Array, spki: Uint8Array];
  }

  export interface Info {
    curve: EcCurve;
  }
}
