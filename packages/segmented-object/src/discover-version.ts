import { Endpoint } from "@ndn/endpoint";
import { Interest, Name } from "@ndn/packet";

import { defaultSegmentConvention, defaultVersionConvention, VersionConvention } from "./convention";
import { fetch } from "./fetch/mod";

/** Discover version with CanBePrefix. */
export async function discoverVersion(name: Name, opts: discoverVersion.Options = {}): Promise<Name> {
  const {
    endpoint = new Endpoint(),
    describe,
    versionConvention = defaultVersionConvention,
    segmentNumConvention = defaultSegmentConvention,
    expectedSuffixLen = 2,
    modifyInterest,
    retxLimit = 2,
    signal,
    verifier,
  } = opts;

  const interest = new Interest(name, Interest.CanBePrefix, Interest.MustBeFresh);
  const data = await endpoint.consume(interest, {
    describe: describe ?? `discoverVersion(${name})`,
    modifyInterest,
    retx: retxLimit,
    signal,
    verifier,
  });

  if ((expectedSuffixLen !== discoverVersion.ANY_SUFFIX_LEN &&
       data.name.length !== name.length + expectedSuffixLen) ||
      !versionConvention.match(data.name.get(-2)!) ||
      !segmentNumConvention.match(data.name.get(-1)!)) {
    throw new Error(`cannot extract version from ${data.name}`);
  }
  return data.name.getPrefix(-1);
}

export namespace discoverVersion {
  export const ANY_SUFFIX_LEN = Symbol("discoverVersion.ANY_SUFFIX_LEN");

  export interface Options extends fetch.Options {
    /**
     * Choose a version naming convention.
     * Default is Version from @ndn/naming-convention2 package.
     */
    versionConvention?: VersionConvention;

    /**
     * Expected number of suffix components, including Version and Segment.
     * Minimum and default are 2, i.e. Version and Segment components.
     * ANY_SUFFIX_LEN allows any suffix length.
     */
    expectedSuffixLen?: number | typeof ANY_SUFFIX_LEN;
  }
}
