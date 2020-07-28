export const SIGN_PARAMS: EcdsaParams = { name: "ECDSA", hash: "SHA-256" };

export function makeGenParams(curve: EcCurve): EcKeyGenParams&EcKeyImportParams {
  return { name: "ECDSA", namedCurve: curve };
}

export const CurveParams = {
  "P-256": {
    pointSize: 32,
    oid: "2A8648CE3D030107", // 1.2.840.10045.3.1.7
  },
  "P-384": {
    pointSize: 48,
    oid: "2B81040022", // 1.3.132.0.34
  },
  "P-521": {
    pointSize: 66,
    oid: "2B81040023", // 1.3.132.0.35
  },
};

export type EcCurve = keyof typeof CurveParams;

export namespace EcCurve {
  export const Default: EcCurve = "P-256";
  export const Choices = Object.keys(CurveParams) as readonly EcCurve[];
}
