import { KeyChainImplWebCrypto as crypto } from "@ndn/keychain";
import { toHex, toUtf8 } from "@ndn/tlv";
import * as asn1 from "@yoursunny/asn1";

function toUint8Array(input: string | Uint8Array): Uint8Array {
  return typeof input === "string" ? toUtf8(input) : input;
}

/** Create EncryptedPrivateKeyInfo. */
export async function create(privateKey: Uint8Array, passphrase: string | Uint8Array): Promise<Uint8Array> {
  void privateKey;
  void passphrase;
  throw new Error("EncryptedPrivateKeyInfo.create is not implemented for browser");
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
    // 1.2.840.113549.1.5.13 pkcs5PBES2
    const { children } = this.parseAlgorithmIdentifier(der, "EncryptionAlgorithm", "PBES2", "2A864886F70D01050D");
    if (children?.length !== 2) {
      throw new Error("bad PBES2-params");
    }
    this.parseKeyDerivationFunc(children[0]!);
    this.parseEncryptionScheme(children[1]!);
  }

  private parseKeyDerivationFunc(der: asn1.ElementBuffer): void {
    // https://datatracker.ietf.org/doc/html/rfc8018#appendix-A.2
    // 1.2.840.113549.1.5.12 pkcs5PBKDF2
    const { children = [] } = this.parseAlgorithmIdentifier(der, "KeyDerivationFunc", "PBKDF2", "2A864886F70D01050C");
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
      this.parsePseudoRandomFunction(children[children.length - 1]!);
    }
  }

  private parsePseudoRandomFunction(der: asn1.ElementBuffer): void {
    // https://datatracker.ietf.org/doc/html/rfc8018#appendix-B.1.2
    // 1.2.840.113549.2.9 hmacWithSHA256
    this.parseAlgorithmIdentifier(der, "PseudoRandomFunction", "hmacWithSHA256", "2A864886F70D0209");
    this.pbkdf2.hash = "SHA-256";
  }

  private parseEncryptionScheme(der: asn1.ElementBuffer): void {
    // https://datatracker.ietf.org/doc/html/rfc8018#appendix-B.2.5
    // 2.16.840.1.101.3.4.1.42 aes256-CBC
    const params = this.parseAlgorithmIdentifier(der, "EncryptionScheme", "aes256-CBC-PAD", "60864801650304012A");
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
    const decrypted = await crypto.subtle.decrypt(this.aes, aesKey, this.data);
    return new Uint8Array(decrypted);
  }
}
