import { SigType } from "@ndn/l3pkt";
import { Name, NameLike } from "@ndn/name";

import { KeyChain, KeyName } from "../..";
import { crypto } from "../../platform";
import { cryptoGenerateKey, PvtExport, PvtExportSClone } from "../internal";
import { PrivateKeyBase } from "../private-key";
import { RsaModulusLength, RsaPublicKey } from ".";
import { ALGO, GEN_PARAMS, IMPORT_PARAMS } from "./internal";

interface RsaPvtExportBase {
  kty: "RSA";
}

/** RSA private key. */
export class RsaPrivateKey extends PrivateKeyBase {
  public static async generate(nameInput: NameLike, modulusLength: RsaModulusLength, keyChain?: KeyChain): Promise<[RsaPrivateKey, RsaPublicKey]> {
    const { privateKey: pvt, publicKey: pub, pvtExport } = await cryptoGenerateKey(
      { ...GEN_PARAMS, modulusLength },
      keyChain,
      { kty: "RSA" });

    const name = KeyName.create(nameInput).toName();
    const privateKey = new RsaPrivateKey(name, pvt);
    const publicKey = new RsaPublicKey(name, pub);
    await keyChain?.insertKey(privateKey, pvtExport, publicKey);
    return [privateKey, publicKey];
  }

  public static async loadPvtExport(name: Name, pvtExport: PvtExport): Promise<RsaPrivateKey> {
    const { pvt } = pvtExport as PvtExportSClone<RsaPvtExportBase>;
    if (pvt) {
      return new RsaPrivateKey(name, pvt);
    }

    const jwk = pvtExport as JsonWebKey;
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
