import type { FwFace } from "@ndn/fw";
import { Keyword, Segment, Version } from "@ndn/naming-convention2";
import { Data, type Name, nullSigner, type Signer, TT as l3TT, ValidityPeriod } from "@ndn/packet";
import { Decoder, Encoder, EvDecoder, NNI } from "@ndn/tlv";
import { assert } from "@ndn/util";

import { TT } from "./an-nfd-prefixreg";

const ContentTypePrefixAnn = 0x05;
const KeywordPA = Keyword.create("PA");
const Segment0 = Segment.create(0);

type Fields = [ep: number, vp?: ValidityPeriod];
const EVD = new EvDecoder<Fields>("PrefixAnn")
  .add(TT.ExpirationPeriod, (t, { nni }) => t[0] = nni, { order: 1, required: true })
  .add(l3TT.ValidityPeriod, (t, { decoder }) => t[1] = decoder.decode(ValidityPeriod), { order: 1 });

/**
 * Prefix Announcement object.
 * @see {@link https://redmine.named-data.net/projects/nfd/wiki/PrefixAnnouncement}
 */
export class PrefixAnn implements FwFace.RouteAnnouncementObj {
  /**
   * Construct Prefix Announcement object from Data packet.
   *
   * @throws Error
   * Thrown if the Data packet is not a Prefix Announcement object.
   */
  public static fromData(data: Data): PrefixAnn {
    const { name, contentType, content } = data;
    assert(name.get(-3)?.equals(KeywordPA) && name.get(-2)!.is(Version) && name.get(-1)!.equals(Segment0),
      `${name} is not a Prefix Announcement name`);
    assert(contentType === ContentTypePrefixAnn, "ContentType must be PrefixAnnouncement");
    const fields = EVD.decodeValue([0] as Fields, new Decoder(content));
    return new PrefixAnn(data, ...fields);
  }

  private constructor(
      public readonly data: Data,
      public readonly expirationPeriod: number,
      public readonly validityPeriod?: ValidityPeriod,
  ) {}

  /** The announced prefix. */
  public get announced(): Name {
    return this.data.name.getPrefix(-3);
  }
}

export namespace PrefixAnn {
  /** {@link PrefixAnn.build} options. */
  export interface BuildOptions {
    /** Announced name. */
    announced: Name;

    /**
     * Prefix Announcement object version.
     * @defaultValue `Date.now()`
     */
    version?: number;

    /** Expiration period in milliseconds. */
    expirationPeriod: number;

    /** ValidityPeriod. */
    validityPeriod?: ValidityPeriod;

    /**
     * Data signer.
     * @defaultValue nullSigner
     */
    signer?: Signer;
  }

  /** Build a Prefix Announcement object from fields. */
  export async function build({
    announced,
    version = Date.now(),
    expirationPeriod,
    validityPeriod,
    signer = nullSigner,
  }: BuildOptions): Promise<PrefixAnn> {
    const encoder = new Encoder();
    validityPeriod?.encodeTo(encoder);
    encoder.prependTlv(TT.ExpirationPeriod, NNI(expirationPeriod));

    const data = new Data();
    data.name = announced.append(KeywordPA, Version.create(version), Segment0);
    data.contentType = ContentTypePrefixAnn;
    data.content = encoder.output;
    await signer.sign(data);
    return PrefixAnn.fromData(data);
  }
}
