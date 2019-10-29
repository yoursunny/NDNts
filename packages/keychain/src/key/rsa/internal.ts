export const ALGO = "RSASSA-PKCS1-v1_5";

export const IMPORT_PARAMS = {
  // tslint:disable-next-line:object-literal-sort-keys
  name: ALGO,
  hash: "SHA-256",
} as RsaHashedImportParams;

export const GEN_PARAMS = {
  ...IMPORT_PARAMS,
  publicExponent: Uint8Array.of(0x01, 0x00, 0x01),
} as Omit<RsaHashedKeyGenParams, "modulusLength">;
