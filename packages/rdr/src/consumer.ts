import { Endpoint, RetxPolicy } from "@ndn/endpoint";
import { Interest, Name, NameLike, Verifier } from "@ndn/packet";
import type { AbortSignal } from "abort-controller";

import { decodeMetadataContent, MetadataKeyword } from "./metadata";

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
export async function retrieveMetadata(prefix: NameLike, {
  endpoint = new Endpoint(),
  retx,
  signal,
  verifier,
}: retrieveMetadata.Options = {}) {
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
  return decodeMetadataContent(data.content);
}

export namespace retrieveMetadata {
  export interface Options {
    endpoint?: Endpoint;
    retx?: RetxPolicy;
    signal?: AbortSignal;
    verifier?: Verifier;
  }
}
