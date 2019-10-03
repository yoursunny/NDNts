import { SigInfo, SigType } from "@ndn/l3pkt";
import { Name, NameLike } from "@ndn/name";

import { KeyName } from "../name";
import { crypto } from "../platform";

import { PrivateKeyBase, PublicKeyBase } from "./base";

export type EcCurve = "P-256" | "P-384" | "P-521";
// tslint:disable-next-line object-literal-sort-keys
const SIGN_PARAMS = { name: "ECDSA", hash: "SHA-256" } as EcdsaParams;

/** ECDSA private key. */
export class EcPrivateKey extends PrivateKeyBase {
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

export namespace EcPrivateKey {
  /**
   * Generate ECDSA key pair.
   * @param name Name or URI as subjectName, or KeyName instance.
   * @param curve EC curve.
   */
  export async function generate(name: NameLike|KeyName, curve: EcCurve): Promise<[EcPrivateKey, EcPublicKey]> {
    const { publicKey: pub, privateKey: pvt }: CryptoKeyPair = await crypto.subtle.generateKey(
      // tslint:disable-next-line object-literal-sort-keys
      { name: "ECDSA", namedCurve: curve } as EcKeyGenParams,
      false,
      ["sign", "verify"],
    );

    const n = KeyName.create(name).toName();
    return [new EcPrivateKey(n, pvt), new EcPublicKey(n, pub)];
  }
}
