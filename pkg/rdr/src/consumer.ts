import { Endpoint, type RetxPolicy } from "@ndn/endpoint";
import { Interest, Name, type NameLike, type Verifier } from "@ndn/packet";
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
 * Retrieve metadata packet of subclass type.
 * @param prefix - Metadata packet prefix.
 * @param opts - Other options.
 * @returns Metadata packet.
 */
export async function retrieveMetadata(prefix: NameLike, opts?: retrieveMetadata.Options): Promise<Metadata>;

/**
 * Retrieve metadata packet of subclass type.
 * @typeParam C - Metadata subclass type.
 * @param prefix - Metadata packet prefix.
 * @param ctor - Metadata subclass constructor.
 * @param opts - Other options.
 * @returns Metadata packet of type C.
 */
export async function retrieveMetadata<C extends Metadata.Constructor>(prefix: NameLike, ctor: C, opts?: retrieveMetadata.Options): Promise<InstanceType<C>>;

export async function retrieveMetadata(prefix: NameLike, arg2: any = {}, opts: retrieveMetadata.Options = {}) {
  let ctor: Metadata.Constructor = Metadata;
  if (typeof arg2 === "function") {
    ctor = arg2;
  } else {
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
  return Decoder.decode(data.content, ctor);
}

export namespace retrieveMetadata {
  export interface Options {
    /**
     * Endpoint for communication.
     * @defaultValue
     * Endpoint on default logical forwarder.
     */
    endpoint?: Endpoint;

    /** Interest retransmission policy. */
    retx?: RetxPolicy;

    /** Abort signal to cancel retrieval. */
    signal?: AbortSignal;

    /**
     * Data verifier.
     * @defaultValue
     * No verification.
     */
    verifier?: Verifier;
  }
}
