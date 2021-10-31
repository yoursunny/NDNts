import { Endpoint, RetxPolicy } from "@ndn/endpoint";
import { Interest, Name, NameLike, Verifier } from "@ndn/packet";
import { Decodable, Decoder } from "@ndn/tlv";

import { Metadata, MetadataKeyword } from "./metadata";

/**
 * Make RDR discovery Interest.
 * @param prefix prefix of RDR metadata packet; 32=metadata component is optional.
 */
export function makeDiscoveryInterest(prefix: NameLike): Interest {
  let name = new Name(prefix);
  if (!name.get(-1)?.equals(MetadataKeyword)) {
    name = name.append(MetadataKeyword);
  }
  return new Interest(name, Interest.CanBePrefix, Interest.MustBeFresh);
}

/** Retrieve RDR metadata packet. */
export async function retrieveMetadata(prefix: NameLike, opts?: retrieveMetadata.Options): Promise<Metadata>;

/** Retrieve RDR metadata packet. */
export async function retrieveMetadata<C extends typeof Metadata>(prefix: NameLike, ctor: C, opts?: retrieveMetadata.Options): Promise<InstanceType<C>>;

export async function retrieveMetadata(prefix: NameLike, arg2: any = {}, opts: retrieveMetadata.Options = {}) {
  let ctor: Decodable<Metadata>;
  if (typeof arg2 === "function") {
    ctor = arg2;
  } else {
    ctor = Metadata;
    opts = arg2;
  }
  const {
    endpoint = new Endpoint(),
    retx,
    signal,
    verifier,
  } = opts;

  const interest = makeDiscoveryInterest(prefix);
  const data = await endpoint.consume(interest, {
    describe: `RDR-c(${prefix})`,
    retx,
    signal,
    verifier,
  });
  return new Decoder(data.content).decode(ctor);
}

export namespace retrieveMetadata {
  export interface Options {
    /** Endpoint for communication. */
    endpoint?: Endpoint;

    /** Interest retransmission policy. */
    retx?: RetxPolicy;

    /** Abort signal to cancel retrieval. */
    signal?: AbortSignal;

    /** Data verifier. Default is no verify. */
    verifier?: Verifier;
  }
}
