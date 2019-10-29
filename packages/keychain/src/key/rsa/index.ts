export * from "./rsa-private-key";
export * from "./rsa-public-key";

export type RsaModulusLength = 1024 | 2048 | 4096;
export const RSA_MODULUS_LENGTHS: ReadonlyArray<RsaModulusLength> = [1024, 2048, 4096];

export function isRsaModulusLength(obj: any): obj is RsaModulusLength {
  return RSA_MODULUS_LENGTHS.includes(obj);
}
