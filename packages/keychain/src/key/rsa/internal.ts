export const ALGO = "RSASSA-PKCS1-v1_5";

export const IMPORT_PARAMS: RsaHashedImportParams = {
  name: ALGO,
  hash: "SHA-256",
};

export const GEN_PARAMS: Omit<RsaHashedKeyGenParams, "modulusLength"> = {
  ...IMPORT_PARAMS,
  publicExponent: Uint8Array.of(0x01, 0x00, 0x01),
};
