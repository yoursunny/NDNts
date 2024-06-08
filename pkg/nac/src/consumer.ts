import { consume, type ConsumerOptions } from "@ndn/endpoint";
import { AESCBC, createDecrypter, type NamedDecrypter, RSAOAEP } from "@ndn/keychain";
import { type Data, type Decrypter, Interest, type Verifier } from "@ndn/packet";
import { Decoder } from "@ndn/tlv";

import { ContentKey, EncryptedContent, KeyDecryptionKey } from "./packet/mod";

/** NAC consumer. */
export class Consumer implements Decrypter {
  public static create({
    cOpts,
    verifier,
    memberDecrypter,
  }: Consumer.Options): Consumer {
    return new Consumer(
      {
        describe: `NAC-Consumer(${memberDecrypter.name})`,
        retx: 2,
        ...cOpts,
        verifier,
      },
      memberDecrypter,
    );
  }

  private constructor(
      private readonly cOpts: ConsumerOptions,
      private readonly memberDecrypter: NamedDecrypter,
  ) {}

  public async decrypt(data: Data): Promise<void> {
    const enc = Decoder.decode(data.content, EncryptedContent);
    ContentKey.parseLocator(enc.name);
    const ckData = await consume(new Interest(enc.name, Interest.CanBePrefix), this.cOpts);
    const ck = await ContentKey.fromData(ckData);

    const kdkName = KeyDecryptionKey.makeName({ ...ck, memberKeyName: this.memberDecrypter.name });
    const kdkData = await consume(new Interest(kdkName, Interest.MustBeFresh), this.cOpts);
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
     * Consumer options.
     *
     * @remarks
     * - `.describe` defaults to "NAC-Consumer" + member name.
     * - `.retx` defaults to 2.
     * - `.verifier` is overridden.
     */
    cOpts?: ConsumerOptions;

    /** Verifier for KDK and CK. */
    verifier: Verifier;

    /** RSA-OAEP private key for decrypting KDK. */
    memberDecrypter: NamedDecrypter;
  }
}
