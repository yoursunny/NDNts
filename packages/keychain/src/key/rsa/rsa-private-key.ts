import { SigType } from "@ndn/l3pkt";
import { Name } from "@ndn/name";

import { KeyName } from "../../name";
import { crypto } from "../../platform";
import { KeyGenResult } from "../internal";
import { PrivateKeyBase } from "../private-key";

import { RsaModulusLength, RsaPublicKey } from ".";
import { ALGO, GEN_PARAMS, IMPORT_PARAMS } from "./internal";

interface RsaPvtExport {
  kty: "RSA";
  pvt: CryptoKey;
}

/** RSA private key. */
export class RsaPrivateKey extends PrivateKeyBase {
  public static async generate(name: KeyName, needJson: boolean,
                               modulusLength: RsaModulusLength): Promise<KeyGenResult> {
    const pair: CryptoKeyPair = await crypto.subtle.generateKey(
      {
        ...GEN_PARAMS,
        // tslint:disable-next-line:object-literal-sort-keys
        modulusLength,
      } as RsaHashedKeyGenParams,
      needJson, ["sign", "verify"]);
    const pub = pair.publicKey;
    let pvt = pair.privateKey;

    let privateKeyExported: object;
    if (needJson) {
      const jwk = await crypto.subtle.exportKey("jwk", pvt);
      privateKeyExported = jwk;
      pvt = await crypto.subtle.importKey("jwk", jwk, IMPORT_PARAMS, false, ["sign"]);
    } else {
      privateKeyExported = { kty: "RSA", pvt } as RsaPvtExport;
    }

    const n = name.toName();
    return {
      privateKey: new RsaPrivateKey(n, pvt),
      privateKeyExported,
      publicKey:  new RsaPublicKey(n, pub),
    };
  }

  public static async importPrivateKey(name: Name, isJson: boolean,
                                       privateKeyExported: object): Promise<RsaPrivateKey> {
    const { kty } = privateKeyExported as JsonWebKey|RsaPvtExport;
    if (kty !== "RSA") {
      throw new Error("not RsaPrivateKey");
    }

    if (!isJson) {
      const { pvt } = privateKeyExported as RsaPvtExport;
      return new RsaPrivateKey(name, pvt);
    }

    const jwk = privateKeyExported as JsonWebKey;
    const key = await crypto.subtle.importKey("jwk", jwk, IMPORT_PARAMS, false, ["sign"]);
    return new RsaPrivateKey(name, key);
  }

  constructor(name: Name, private readonly key: CryptoKey) {
    super(name, SigType.Sha256WithRsa, name);
  }

  protected async llSign(input: Uint8Array): Promise<Uint8Array> {
    const rawSig = await crypto.subtle.sign(ALGO, this.key, input);
    return new Uint8Array(rawSig);
  }
}
