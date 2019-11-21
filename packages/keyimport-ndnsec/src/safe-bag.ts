import { Certificate } from "@ndn/keychain";
import { Data, TT as l3TT } from "@ndn/packet";
import { Decoder, EvDecoder } from "@ndn/tlv";
import { createPrivateKey } from "crypto";

import { TT } from "./an";

interface SafeBagFields {
  certificate?: Certificate;
  encryptedKey?: Uint8Array;
}

const EVD = new EvDecoder<SafeBagFields>("SafeBag", TT.SafeBag)
.add(l3TT.Data, (t, { decoder }) => t.certificate = new Certificate(decoder.decode(Data)))
.add(TT.EncryptedKeyBag, (t, { value }) => t.encryptedKey = value);

/** ndn-cxx private key export. */
export class SafeBag {
  public static decodeFrom(decoder: Decoder): SafeBag {
    const { certificate, encryptedKey } = EVD.decode({} as SafeBagFields, decoder);
    if (!certificate || !encryptedKey) {
      throw new Error("invalid SafeBag");
    }
    return new SafeBag(certificate, encryptedKey);
  }

  constructor(public readonly certificate: Certificate, public readonly encryptedKey: Uint8Array) {
  }

  /** Decrypt private key and return unencrypted PKCS8 format. */
  public decryptKey(passphrase: string): Uint8Array {
    const key = createPrivateKey({
      key: Buffer.from(this.encryptedKey),
      format: "der",
      type: "pkcs8",
      passphrase,
    });
    return key.export({ type: "pkcs8", format: "der" });
  }
}
