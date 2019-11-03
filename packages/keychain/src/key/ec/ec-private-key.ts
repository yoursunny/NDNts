import { SigType } from "@ndn/l3pkt";
import { Name, NameLike } from "@ndn/name";

import { KeyChain, KeyName } from "../..";
import { crypto } from "../../platform";
import { cryptoGenerateKey, PvtExport, PvtExportSClone } from "../internal";
import { PrivateKeyBase } from "../private-key";
import { EcCurve, EcPublicKey } from ".";
import { SIGN_PARAMS, sigRawToDer } from "./internal";

type EcPvtExportBase = {
  kty: "EC";
  crv: EcCurve;
};

/** ECDSA private key. */
export class EcPrivateKey extends PrivateKeyBase {
  public static async generate(nameInput: NameLike, curve: EcCurve, keyChain?: KeyChain): Promise<[EcPrivateKey, EcPublicKey]> {
    const { privateKey: pvt, publicKey: pub, pvtExport } = await cryptoGenerateKey(
      { name: "ECDSA", namedCurve: curve },
      keyChain,
      { kty: "EC", crv: curve });

    const name = KeyName.create(nameInput).toName();
    const privateKey = new EcPrivateKey(name, curve, pvt);
    const publicKey = new EcPublicKey(name, curve, pub);
    await keyChain?.insertKey(privateKey, pvtExport, publicKey);
    return [privateKey, publicKey];
  }

  public static async loadPvtExport(name: Name, pvtExport: PvtExport): Promise<EcPrivateKey> {
    const { crv, pvt } = pvtExport as PvtExportSClone<EcPvtExportBase>;
    if (pvt) {
      return new EcPrivateKey(name, crv, pvt);
    }

    const jwk = pvtExport as JsonWebKey;
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
