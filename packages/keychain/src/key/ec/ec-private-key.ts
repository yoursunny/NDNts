import { SigType } from "@ndn/l3pkt";
import { Name } from "@ndn/name";

import { KeyName } from "../../name";
import { crypto } from "../../platform";
import { KeyGenResult } from "../internal";
import { PrivateKeyBase } from "../private-key";

import { EcCurve, EcPublicKey, isEcCurve } from ".";
import { SIGN_PARAMS, sigRawToDer } from "./internal";

interface EcPvtExport {
  kty: "EC";
  crv: EcCurve;
  pvt: CryptoKey;
}

/** ECDSA private key. */
export class EcPrivateKey extends PrivateKeyBase {
  public static async generate(name: KeyName, needJson: boolean, curve: EcCurve): Promise<KeyGenResult> {
    const params = { name: "ECDSA", namedCurve: curve };
    const pair: CryptoKeyPair = await crypto.subtle.generateKey(params, needJson, ["sign", "verify"]);
    const pub = pair.publicKey;
    let pvt = pair.privateKey;

    let privateKeyExported: object;
    /* istanbul ignore else browser-only */
    if (needJson) {
      const jwk = await crypto.subtle.exportKey("jwk", pvt);
      privateKeyExported = jwk;
      pvt = await crypto.subtle.importKey("jwk", jwk, params, false, ["sign"]);
    } else {
      privateKeyExported = { kty: "EC", crv: curve, pvt } as EcPvtExport;
    }

    const n = name.toName();
    return {
      privateKey: new EcPrivateKey(n, curve, pvt),
      privateKeyExported,
      publicKey:  new EcPublicKey(n, curve, pub),
    };
  }

  public static async importPrivateKey(name: Name, isJson: boolean,
                                       privateKeyExported: object): Promise<EcPrivateKey> {
    const { kty, crv } = privateKeyExported as JsonWebKey|EcPvtExport;
    if (kty !== "EC" || !isEcCurve(crv)) {
      throw new Error("not EcPrivateKey");
    }

    /* istanbul ignore if browser-only */
    if (!isJson) {
      const { pvt } = privateKeyExported as EcPvtExport;
      return new EcPrivateKey(name, crv, pvt);
    }

    const jwk = privateKeyExported as JsonWebKey;
    const key = await crypto.subtle.importKey("jwk", jwk,
      { name: "ECDSA", namedCurve: crv },
      false, ["sign"]);
    return new EcPrivateKey(name, crv, key);
  }

  constructor(name: Name, public readonly curve: EcCurve, private readonly key: CryptoKey) {
    super(name, SigType.Sha256WithEcdsa, name);
  }

  protected async llSign(input: Uint8Array): Promise<Uint8Array> {
    const rawSig = await crypto.subtle.sign(SIGN_PARAMS, this.key, input);
    return sigRawToDer(new Uint8Array(rawSig), this.curve);
  }
}
