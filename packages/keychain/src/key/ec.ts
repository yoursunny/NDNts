import { SigInfo, SigType } from "@ndn/l3pkt";
import { Name } from "@ndn/name";

import { KeyName } from "../name";
import { crypto } from "../platform";

import { KEYGEN, KeyGenResult } from "./internal";
import { PrivateKeyBase } from "./private-key";
import { PublicKeyBase } from "./public-key";

export type EcCurve = "P-256" | "P-384" | "P-521";
// tslint:disable-next-line:object-literal-sort-keys
const SIGN_PARAMS = { name: "ECDSA", hash: "SHA-256" } as EcdsaParams;

/** ECDSA private key. */
export class EcPrivateKey extends PrivateKeyBase {
  public static async [KEYGEN](name: KeyName, needJson: boolean, curve: EcCurve): Promise<KeyGenResult> {
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
      privateKeyExported = pvt;
    }

    const n = name.toName();
    return {
      privateKey: new EcPrivateKey(n, pvt),
      privateKeyExported,
      publicKey:  new EcPublicKey(n, pub),
    };
  }

  constructor(name: Name, private readonly key: CryptoKey) {
    super(name, SigType.Sha256WithEcdsa, name);
  }

  protected async llSign(input: Uint8Array): Promise<Uint8Array> {
    const sig = await crypto.subtle.sign(SIGN_PARAMS, this.key, input);
    return new Uint8Array(sig);
  }
}

/** ECDSA public key. */
export class EcPublicKey extends PublicKeyBase {
  constructor(name: Name, private readonly key: CryptoKey) {
    super(name, SigType.Sha256WithEcdsa, name);
  }

  public async exportAsSpki(): Promise<Uint8Array> {
    const spki = await crypto.subtle.exportKey("spki", this.key);
    return new Uint8Array(spki);
  }

  protected doMatch(si: SigInfo): boolean {
    // TODO match KeyDigest
    return si.keyLocator instanceof Name && si.keyLocator.isPrefixOf(this.name);
  }

  protected async llVerify(input: Uint8Array, sig: Uint8Array): Promise<void> {
    const ok = await crypto.subtle.verify(SIGN_PARAMS, this.key, sig, input);
    PublicKeyBase.throwOnIncorrectSig(ok);
  }
}
