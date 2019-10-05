import { isKey, PrivateKeyBase, PublicKeyBase } from "./internal";

export type PrivateKey = PrivateKeyBase;

export namespace PrivateKey {
  /** Determine if obj is a private key. */
  export function isPrivateKey(obj: any): obj is PrivateKey {
    return isKey(obj) && typeof (obj as PrivateKey).sign === "function";
  }
}

export type PublicKey = PublicKeyBase;

export namespace PublicKey {
  /** Determine if obj is a public key. */
  export function isPublicKey(obj: any): obj is PublicKey {
    return isKey(obj) && typeof (obj as PublicKey).verify === "function";
  }

  export type SpkiExportable = PublicKeyBase.SpkiExportable;
}
