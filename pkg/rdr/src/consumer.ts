import { consume, type ConsumerOptions, type Endpoint } from "@ndn/endpoint";
import { Interest, Name, type NameLike } from "@ndn/packet";
import { Decoder } from "@ndn/tlv";

import { Metadata, MetadataKeyword } from "./metadata";

/**
 * Make discovery Interest.
 * @param prefix - Metadata packet prefix.
 * `32=metadata` component is optional; it will be appended automatically if absent.
 */
export function makeDiscoveryInterest(prefix: NameLike): Interest {
  let name = Name.from(prefix);
  if (!name.get(-1)?.equals(MetadataKeyword)) {
    name = name.append(MetadataKeyword);
  }
  return new Interest(name, Interest.CanBePrefix, Interest.MustBeFresh);
}

/**
 * Retrieve metadata packet of base type.
 * @param prefix - Metadata packet prefix.
 * @param cOpts - Consumer options.
 * - Commonly specified: `.retx` and `.verifier`.
 * - `.describe` defaults to "RDR-c" + prefix.
 * @returns Metadata packet.
 */
export async function retrieveMetadata(
  prefix: NameLike,
  cOpts?: ConsumerOptions & EndpointOptions
): Promise<Metadata>;

/**
 * Retrieve metadata packet of subclass type.
 * @typeParam C - Metadata subclass type.
 * @param prefix - Metadata packet prefix.
 * @param ctor - Metadata subclass constructor.
 * @param cOpts - Consumer options.
 * - Commonly specified: `.retx` and `.verifier`.
 * - `.describe` defaults to "RDR-c" + prefix.
 * @returns Metadata packet of type C.
 */
export async function retrieveMetadata<C extends Metadata.Constructor>(
  prefix: NameLike, ctor: C,
  cOpts?: ConsumerOptions & EndpointOptions
): Promise<InstanceType<C>>;

export async function retrieveMetadata(
    prefix: NameLike, arg2: any,
    cOpts?: ConsumerOptions & EndpointOptions,
) {
  let ctor: Metadata.Constructor = Metadata;
  if (typeof arg2 === "function") {
    ctor = arg2;
  } else {
    cOpts = arg2;
  }

  const interest = makeDiscoveryInterest(prefix);
  const data = await consume(interest, {
    describe: `RDR-c(${prefix})`,
    ...cOpts?.endpoint?.cOpts, // eslint-disable-line etc/no-deprecated
    ...cOpts,
  });
  return Decoder.decode(data.content, ctor);
}

interface EndpointOptions {
  /**
   * Endpoint for communication.
   * @deprecated Use {@link ConsumerOptions} fields only.
   */
  endpoint?: Endpoint;
}
