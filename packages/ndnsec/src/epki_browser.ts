import { crypto, fromHex, toHex, toUtf8 } from "@ndn/util";
import * as asn1 from "@yoursunny/asn1";

const OID = {
  pkcs5PBES2: "2A864886F70D01050D", // 1.2.840.113549.1.5.13
  pkcs5PBKDF2: "2A864886F70D01050C", // 1.2.840.113549.1.5.12
  hmacWithSHA256: "2A864886F70D0209", // 1.2.840.113549.2.9
  aes256CBC: "60864801650304012A", // 2.16.840.1.101.3.4.1.42
};

function toUint8Array(input: string | Uint8Array): Uint8Array {
  return typeof input === "string" ? toUtf8(input) : input;
}

/** Create EncryptedPrivateKeyInfo. */
export async function create(privateKey: Uint8Array, passphrase: string | Uint8Array): Promise<Uint8Array> {
  const pbkdf2: Pbkdf2Params = {
    name: "PBKDF2",
    hash: "SHA-256",
    salt: crypto.getRandomValues(new Uint8Array(8)),
    iterations: 2048,
  };
  const iterationsHex = "0800";
  const aes: AesCbcParams = {
    name: "AES-CBC",
    iv: crypto.getRandomValues(new Uint8Array(16)),
  };

  const pbkdf2Key = await crypto.subtle.importKey("raw", toUint8Array(passphrase), "PBKDF2", false, ["deriveBits"]);
  const dk = await crypto.subtle.deriveBits(pbkdf2, pbkdf2Key, 256);
  const aesKey = await crypto.subtle.importKey("raw", dk, "AES-CBC", false, ["encrypt"]);
  const encrypted = new Uint8Array(await crypto.subtle.encrypt(aes, aesKey, privateKey));

  return fromHex(asn1.Any("30",
    asn1.Any("30",
      asn1.Any("06", OID.pkcs5PBES2),
      asn1.Any("30",
        asn1.Any("30",
          asn1.Any("06", OID.pkcs5PBKDF2),
          asn1.Any("30",
            asn1.Any("04", toHex(pbkdf2.salt as Uint8Array)),
            asn1.UInt(iterationsHex),
            asn1.Any("30",
              asn1.Any("06", OID.hmacWithSHA256),
              asn1.Any("05"),
            ),
          ),
        ),
        asn1.Any("30",
          asn1.Any("06", OID.aes256CBC),
          asn1.Any("04", toHex(aes.iv as Uint8Array)),
        ),
      ),
    ),
    asn1.Any("04", toHex(encrypted)),
  ));
}

/** Decrypt EncryptedPrivateKeyInfo. */
export async function decrypt(encryptedKey: Uint8Array, passphrase: string | Uint8Array): Promise<Uint8Array> {
  const parser = new EncryptedPrivateKeyInfoParser(encryptedKey);
  return parser.decrypt(toUint8Array(passphrase));
}

class EncryptedPrivateKeyInfoParser {
  public pbkdf2: Pbkdf2Params = {
    name: "PBKDF2",
    hash: "SHA-1",
    salt: new Uint8Array(),
    iterations: 1,
  };

  public aes: AesCbcParams = {
    name: "AES-CBC",
    iv: new Uint8Array(),
  };

  public data = new Uint8Array();

  constructor(encryptedKey: Uint8Array) {
    this.parse(asn1.parseVerbose(encryptedKey));
  }

  private parse(der: asn1.ElementBuffer): void {
    // https://datatracker.ietf.org/doc/html/rfc5958#section-3
    if (der.children?.length !== 2) {
      throw new Error("bad EncryptedPrivateKeyInfo");
    }
    this.parseEncryptionAlgorithm(der.children[0]!);
    this.parseEncryptedData(der.children[1]!);
  }

  private parseAlgorithmIdentifier(
      der: asn1.ElementBuffer,
      elementName: string,
      algoName: string,
      oidHex: string,
  ): asn1.ElementBuffer {
    if (der.children?.length !== 2) {
      throw new Error(`bad ${elementName}`);
    }
    if (toHex(der.children[0]!.value!) !== oidHex) {
      throw new Error(`not ${algoName}`);
    }
    return der.children[1]!;
  }

  private parseEncryptionAlgorithm(der: asn1.ElementBuffer): void {
    // https://datatracker.ietf.org/doc/html/rfc8018#appendix-A.4
    const { children } = this.parseAlgorithmIdentifier(der, "EncryptionAlgorithm", "PBES2", OID.pkcs5PBES2);
    if (children?.length !== 2) {
      throw new Error("bad PBES2-params");
    }
    this.parseKeyDerivationFunc(children[0]!);
    this.parseEncryptionScheme(children[1]!);
  }

  private parseKeyDerivationFunc(der: asn1.ElementBuffer): void {
    // https://datatracker.ietf.org/doc/html/rfc8018#appendix-A.2
    const { children = [] } = this.parseAlgorithmIdentifier(der, "KeyDerivationFunc", "PBKDF2", OID.pkcs5PBKDF2);
    if (children.length < 2 || children.length > 4) {
      throw new Error("bad PBKDF2-params");
    }

    const [salt, iterationCount] = children;
    if (salt!.type !== 0x04 || iterationCount!.type !== 0x02) {
      throw new Error("bad PBKDF2-params");
    }
    this.pbkdf2.salt = salt!.value!;
    this.pbkdf2.iterations = Number.parseInt(toHex(iterationCount!.value!), 16);

    if (children.length > 2) {
      this.parsePseudoRandomFunction(children.at(-1)!);
    }
  }

  private parsePseudoRandomFunction(der: asn1.ElementBuffer): void {
    // https://datatracker.ietf.org/doc/html/rfc8018#appendix-B.1.2
    this.parseAlgorithmIdentifier(der, "PseudoRandomFunction", "hmacWithSHA256", OID.hmacWithSHA256);
    this.pbkdf2.hash = "SHA-256";
  }

  private parseEncryptionScheme(der: asn1.ElementBuffer): void {
    // https://datatracker.ietf.org/doc/html/rfc8018#appendix-B.2.5
    const params = this.parseAlgorithmIdentifier(der, "EncryptionScheme", "aes256-CBC-PAD", OID.aes256CBC);
    if (params.type !== 0x04 || params.length !== 16) {
      throw new Error("bad aes256-CBC-PAD initialization vector");
    }
    this.aes.iv = params.value!;
  }

  private parseEncryptedData(der: asn1.ElementBuffer): void {
    if (der.type !== 0x04) {
      throw new Error("bad EncryptedData");
    }
    this.data = der.value!;
  }

  public async decrypt(passphrase: Uint8Array): Promise<Uint8Array> {
    const pbkdf2Key = await crypto.subtle.importKey("raw", passphrase, "PBKDF2", false, ["deriveBits"]);
    const dk = await crypto.subtle.deriveBits(this.pbkdf2, pbkdf2Key, 256);
    const aesKey = await crypto.subtle.importKey("raw", dk, "AES-CBC", false, ["decrypt"]);
    return new Uint8Array(await crypto.subtle.decrypt(this.aes, aesKey, this.data));
  }
}
