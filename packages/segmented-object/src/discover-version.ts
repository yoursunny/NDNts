import { Endpoint } from "@ndn/endpoint";
import { Interest, Name } from "@ndn/packet";

import { defaultSegmentConvention, defaultVersionConvention, VersionConvention } from "./convention";
import { fetch } from "./fetch/mod";

/** Discover version with CanBePrefix. */
export async function discoverVersion(name: Name, opts: discoverVersion.Options = {}): Promise<Name> {
  const {
    endpoint = new Endpoint(),
    versionConvention = defaultVersionConvention,
    segmentNumConvention = defaultSegmentConvention,
    retxLimit = 2,
    signal,
    verifier,
  } = opts;

  const interest = new Interest(name, Interest.CanBePrefix, Interest.MustBeFresh);
  const data = await endpoint.consume(interest, { retx: retxLimit, signal, verifier });

  if (data.name.length !== name.length + 2 ||
      !versionConvention.match(data.name.get(-2)!) ||
      !segmentNumConvention.match(data.name.get(-1)!)) {
    throw new Error(`cannot extract version from ${data.name}`);
  }
  return data.name.getPrefix(-1);
}

export namespace discoverVersion {
  export interface Options extends fetch.Options {
    /**
     * Choose a version naming convention.
     * Default is Version from @ndn/naming-convention2 package.
     */
    versionConvention?: VersionConvention;
  }
}
