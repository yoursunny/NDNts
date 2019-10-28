export { EcPrivateKey } from "./ec-private-key";
export { EcPublicKey } from "./ec-public-key";

export type EcCurve = "P-256" | "P-384" | "P-521";
export const EC_CURVES: ReadonlyArray<EcCurve> = ["P-256", "P-384", "P-521"];

export function isEcCurve(obj: any): obj is EcCurve {
  return EC_CURVES.includes(obj);
}
