import { Endpoint, Producer } from "@ndn/endpoint";
import { Segment, Version } from "@ndn/naming-convention2";
import { Data, digestSigning, Interest, Name, NameLike, Signer } from "@ndn/packet";

import { encodeMetadataContent, Metadata, MetadataKeyword } from "./metadata";

function makeName(payload: Metadata, prefix?: NameLike): Name {
  const name = prefix ? new Name(prefix) : payload.name.getPrefix(-1);
  return name.append(MetadataKeyword, Version.create(Date.now()), Segment.create(0));
}

interface Options {
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

  /** Endpoint to run producer. */
  endpoint?: Endpoint;

  /** Prefix to announce from producer. */
  announcement?: Endpoint.RouteAnnouncement;
}

/** Make RDR metadata packet. */
export async function makeMetadataPacket(m: Metadata, {
  freshnessPeriod = 1,
  prefix,
  signer = digestSigning,
}: Options = {}): Promise<Data> {
  let name = prefix ? new Name(prefix) : m.name.getPrefix(-1);
  name = name.append(MetadataKeyword, Version.create(Date.now()), Segment.create(0));

  const data = new Data();
  data.name = makeName(m, prefix);
  data.content = encodeMetadataContent(m);
  data.freshnessPeriod = freshnessPeriod;
  await signer.sign(data);
  return data;
}

/** Determine if an Interest is an RDR discovery Interest. */
export function isDiscoveryInterest({ name, canBePrefix, mustBeFresh }: Interest): boolean {
  return (name.get(-1)?.equals(MetadataKeyword) ?? false) && canBePrefix && mustBeFresh;
}

/** Serve RDR metadata packet in a producer. */
export function serveMetadata(m: Metadata | (() => Metadata), opts: Options = {}): Producer {
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
