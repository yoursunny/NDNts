import { type ConsumerOptions, Endpoint } from "@ndn/endpoint";
import { AESCBC, createDecrypter, type NamedDecrypter, RSAOAEP } from "@ndn/keychain";
import { type Data, type Decrypter, Interest, type Verifier } from "@ndn/packet";
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
    const consumeOpts: ConsumerOptions = {
      describe: `NAC-Consumer(${this.memberDecrypter.name})`,
      verifier: this.verifier,
    };

    const enc = Decoder.decode(data.content, EncryptedContent);
    ContentKey.parseLocator(enc.name);
    const ckData = await this.endpoint.consume(new Interest(enc.name, Interest.CanBePrefix), consumeOpts);
    const ck = await ContentKey.fromData(ckData);

    const kdkName = KeyDecryptionKey.makeName({ ...ck, memberKeyName: this.memberDecrypter.name });
    const kdkData = await this.endpoint.consume(new Interest(kdkName, Interest.MustBeFresh), consumeOpts);
    const kdk = await KeyDecryptionKey.fromData(kdkData);

    const kdkDecrypter = createDecrypter(RSAOAEP, await kdk.loadKeyPair(this.memberDecrypter));
    const ckDecrypter = createDecrypter(AESCBC, await ck.loadKey(kdkDecrypter));
    const { plaintext } = await ckDecrypter.llDecrypt(enc);
    data.content = plaintext;
  }
}

export namespace Consumer {
  /** {@link Consumer.create} options. */
  export interface Options {
    /**
     * Endpoint for communication.
     * @defaultValue
     * Endpoint on default logical forwarder with up to 2 retransmissions.
     */
    endpoint?: Endpoint;

    /** Verifier for KDK and CK. */
    verifier: Verifier;

    /** RSA-OAEP private key for decrypting KDK. */
    memberDecrypter: NamedDecrypter;
  }
}
