import { Endpoint } from "@ndn/endpoint";
import { AESCBC, createDecrypter, NamedDecrypter, RSAOAEP } from "@ndn/keychain";
import { Data, Decrypter, Interest, Verifier } from "@ndn/packet";
import { Decoder } from "@ndn/tlv";

import { ContentKey, EncryptedContent, KeyDecryptionKey } from "./packet/mod";

/** NAC consumer. */
export class Consumer implements Decrypter {
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
    ContentKey.parseLocator(enc.name);
    const ckData = await this.endpoint.consume(
      new Interest(enc.name, Interest.CanBePrefix),
      { verifier: this.verifier });
    const ck = await ContentKey.fromData(ckData);

    const kdkName = KeyDecryptionKey.makeName({ ...ck, memberKeyName: this.memberDecrypter.name });
    const kdkData = await this.endpoint.consume(
      new Interest(kdkName, Interest.MustBeFresh),
      { verifier: this.verifier });
    const kdk = await KeyDecryptionKey.fromData(kdkData);

    const kdkDecrypter = createDecrypter(RSAOAEP, await kdk.loadKeyPair(this.memberDecrypter));
    const ckDecrypter = createDecrypter(AESCBC, await ck.loadKey(kdkDecrypter));
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
