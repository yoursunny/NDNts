import { Endpoint, RetxPolicy } from "@ndn/endpoint";
import { Interest, Name, NameLike, Verifier } from "@ndn/packet";
import { Decoder } from "@ndn/tlv";
import type { AbortSignal } from "abort-controller";

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
export async function retrieveMetadata<M extends Metadata = Metadata>(prefix: NameLike, {
  endpoint = new Endpoint(),
  retx,
  signal,
  verifier,
  Metadata: ctor = Metadata as any,
}: retrieveMetadata.Options<M> = {}) {
  const interest = makeDiscoveryInterest(prefix);
  const consumer = endpoint.consume(interest, {
    describe: `RDR-c(${prefix})`,
    retx,
    signal,
  });

  const data = await consumer;
  if (verifier) {
    await verifier.verify(data);
  }
  return new Decoder(data.content).decode(ctor);
}

export namespace retrieveMetadata {
  export interface Options<M extends Metadata = Metadata> {
    /** Endpoint for communication. */
    endpoint?: Endpoint;

    /** Interest retransmission policy. */
    retx?: RetxPolicy;

    /** Abort signal to cancel retrieval. */
    signal?: AbortSignal | globalThis.AbortSignal;

    /** Data verifier. Default is no verify. */
    verifier?: Verifier;

    /** Metadata type that can have extensions. */
    Metadata?: Metadata.Constructor<M>;
  }
}
