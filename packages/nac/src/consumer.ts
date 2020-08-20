import { Endpoint } from "@ndn/endpoint";
import { AES, createDecrypter, NamedDecrypter, RSAOAEP } from "@ndn/keychain";
import { Data, Interest, Verifier } from "@ndn/packet";
import { Decoder } from "@ndn/tlv";

import { ContentKey, EncryptedContent, KeyDecryptionKey } from "./packet/mod";

/** NAC consumer. */
export class Consumer {
  public static create({
    endpoint = new Endpoint({ retx: 2 }),
    verifier,
    memberDecrypter,
  }: Consumer.Options): Consumer {
    return new Consumer(
      endpoint,
      verifier,
      memberDecrypter,
    );
  }

  private constructor(
      private readonly endpoint: Endpoint,
      private readonly verifier: Verifier,
      private readonly memberDecrypter: NamedDecrypter,
  ) {}

  public async decrypt(data: Data): Promise<void> {
    const enc = new Decoder(data.content).decode(EncryptedContent);
    const ckName = ContentKey.parseName(enc.name);

    const [ck, kdk] = await Promise.all([
      (async () => {
        const ckInterest = new Interest(enc.name);
        const ckData = await this.endpoint.consume(ckInterest, { verifier: this.verifier });
        return ContentKey.fromData(ckData);
      })(),
      (async () => {
        const kdkName = KeyDecryptionKey.makeName({ ...ckName, memberKeyName: this.memberDecrypter.name });
        const kdkInterest = new Interest(kdkName);
        const kdkData = await this.endpoint.consume(kdkInterest, { verifier: this.verifier });
        return KeyDecryptionKey.fromData(kdkData);
      })(),
    ]);
    const kdkDecrypter = createDecrypter(RSAOAEP, await kdk.loadKeyPair(this.memberDecrypter));
    const ckDecrypter = createDecrypter(AES.CBC, await ck.loadKey(kdkDecrypter));

    const { plaintext } = await ckDecrypter.llDecrypt(enc);
    data.content = plaintext;
  }
}

export namespace Consumer {
  export interface Options {
    /**
     * Endpoint for communication.
     * Default is an Endpoint on the default forwarder with 2 retransmissions.
     */
    endpoint?: Endpoint;

    /** Verifier for KDK and CK. */
    verifier: Verifier;

    /** RSA-OAEP private keys for decrypting KDK. */
    memberDecrypter: NamedDecrypter;
  }
}
