export * from "./public-key";
export * from "./private-key";

export type EcCurve = "P-256" | "P-384" | "P-521";
export const EC_CURVES: readonly EcCurve[] = ["P-256", "P-384", "P-521"];
