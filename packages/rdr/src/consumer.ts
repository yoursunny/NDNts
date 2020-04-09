import { Endpoint, RetxPolicy } from "@ndn/endpoint";
import { PublicKey } from "@ndn/keychain";
import { Interest, Name, NameLike } from "@ndn/packet";
import PCancelable from "p-cancelable";

import { decodeMetadataContent, Metadata, MetadataKeyword } from "./metadata";

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

interface Options {
  endpoint?: Endpoint;
  retx?: RetxPolicy;
  verifier?: PublicKey;
}

/** Retrieve RDR metadata packet. */
export const retrieveMetadata: (prefix: NameLike, opts?: Options) => PCancelable<Metadata> =
PCancelable.fn(async (prefix: NameLike, arg2: any, arg3: any) => {
  const [{
    endpoint = new Endpoint(),
    retx,
    verifier,
  }, onCancel]: [Options, PCancelable.OnCancelFunction] =
    typeof arg2 === "function" ? [{}, arg2] : [arg2, arg3];

  const interest = makeDiscoveryInterest(prefix);
  const consumer = endpoint.consume(interest, {
    retx,
    describe: `RDR-c(${prefix})`,
  });
  onCancel(() => consumer.cancel());

  const data = await consumer;
  if (verifier) {
    await verifier.verify(data);
  }
  return decodeMetadataContent(data.content);
});
