import { type Producer, Endpoint } from "@ndn/endpoint";
import { Segment, Version } from "@ndn/naming-convention2";
import { type Interest, type NameLike, type Signer, Data, digestSigning, Name } from "@ndn/packet";
import { Encoder } from "@ndn/tlv";

import { Metadata, MetadataKeyword } from "./metadata";

function makeName(payload: Metadata, prefix?: NameLike): Name {
  const name = prefix ? Name.from(prefix) : payload.name.getPrefix(-1);
  return name.append(MetadataKeyword, Version.create(Date.now()), Segment.create(0));
}

/** Make RDR metadata packet. */
export async function makeMetadataPacket(m: Metadata, {
  prefix,
  freshnessPeriod = 1,
  signer = digestSigning,
}: makeMetadataPacket.Options = {}): Promise<Data> {
  const data = new Data();
  data.name = makeName(m, prefix);
  data.content = Encoder.encode(m);
  data.freshnessPeriod = freshnessPeriod;
  await signer.sign(data);
  return data;
}

export namespace makeMetadataPacket {
  export interface Options {
    /**
     * RDR metadata packet prefix.
     *
     * This should not contain 32=metadata.
     *
     * @default metadata.name.getPrefix(-1)
     */
    prefix?: NameLike;

    /**
     * FreshnessPeriod.
     * @default 1
     */
    freshnessPeriod?: number;

    /** Signing key. */
    signer?: Signer;
  }
}

/** Determine if an Interest is an RDR discovery Interest. */
export function isDiscoveryInterest({ name, canBePrefix, mustBeFresh }: Interest): boolean {
  return !!(name.get(-1)?.equals(MetadataKeyword)) && canBePrefix && mustBeFresh;
}

/** Serve RDR metadata packet in a producer. */
export function serveMetadata(m: Metadata | (() => Metadata), opts: serveMetadata.Options = {}): Producer {
  const { prefix, endpoint = new Endpoint() } = opts;
  const makeMetadata = typeof m === "function" ? m : () => m;
  const name = makeName(makeMetadata(), prefix).getPrefix(-2);

  return endpoint.produce(name,
    async (interest) => {
      if (isDiscoveryInterest(interest) && interest.name.length === name.length) {
        return makeMetadataPacket(makeMetadata(), opts);
      }
      return undefined;
    },
    {
      describe: `RDR-s(${name})`,
      announcement: opts.announcement,
    });
}
export namespace serveMetadata {
  export interface Options extends makeMetadataPacket.Options {
    /** Endpoint for communication. */
    endpoint?: Endpoint;

    /** Prefix to announce from producer. */
    announcement?: Endpoint.RouteAnnouncement;
  }
}

