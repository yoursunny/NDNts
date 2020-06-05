export const SIGN_PARAMS: EcdsaParams = { name: "ECDSA", hash: "SHA-256" };

export function makeGenParams(curve: EcCurve): EcKeyGenParams&EcKeyImportParams {
  return { name: "ECDSA", namedCurve: curve };
}

export const EC_POINT_SIZE = {
  "P-256": 32,
  "P-384": 48,
  "P-521": 66,
};

export type EcCurve = keyof typeof EC_POINT_SIZE;

export const EC_CURVES = Object.keys(EC_POINT_SIZE) as readonly EcCurve[];
