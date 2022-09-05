import { Endpoint } from "@ndn/endpoint";
import { type Name, Interest } from "@ndn/packet";

import { type SegmentConvention, type VersionConvention, defaultSegmentConvention, defaultVersionConvention } from "./convention";
import type { fetch } from "./fetch/mod";

/** Discover version with CanBePrefix. */
export async function discoverVersion(name: Name, {
  endpoint = new Endpoint(),
  describe,
  versionConvention = defaultVersionConvention,
  segmentNumConvention = defaultSegmentConvention,
  conventions: conventionsInput = [],
  expectedSuffixLen = 2,
  modifyInterest,
  retxLimit = 2,
  signal,
  verifier,
}: discoverVersion.Options = {}): Promise<discoverVersion.Result> {
  const conventions: ReadonlyArray<[VersionConvention, SegmentConvention]> =
    conventionsInput.length > 0 ? conventionsInput : [[versionConvention, segmentNumConvention]];

  const interest = new Interest(name, Interest.CanBePrefix, Interest.MustBeFresh);
  const data = await endpoint.consume(interest, {
    describe: describe ?? `discoverVersion(${name})`,
    modifyInterest,
    retx: retxLimit,
    signal,
    verifier,
  });

  const vComp = data.name.get(-2);
  const sComp = data.name.get(-1);
  let conventionIndex: number;
  if ((expectedSuffixLen !== discoverVersion.ANY_SUFFIX_LEN &&
       data.name.length !== name.length + expectedSuffixLen) ||
      (conventionIndex = conventions.findIndex(([v, s]) => v.match(vComp!) && s.match(sComp!))) < 0) {
    throw new Error(`cannot extract version from ${data.name}`);
  }
  return Object.defineProperties(data.name.getPrefix(-1), {
    versionConvention: { value: conventions[conventionIndex]![0] },
    segmentNumConvention: { value: conventions[conventionIndex]![1] },
  }) as discoverVersion.Result;
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
     * List of acceptable version+segment naming convention combinations.
     * If this is specified and non-empty, it overrides versionConvention,segmentNumConvention.
     */
    conventions?: ReadonlyArray<[VersionConvention, SegmentConvention]>;

    /**
     * Expected number of suffix components, including Version and Segment.
     * Minimum and default are 2, i.e. Version and Segment components.
     * ANY_SUFFIX_LEN allows any suffix length.
     */
    expectedSuffixLen?: number | typeof ANY_SUFFIX_LEN;
  }

  export type Result = Name & {
    /** Recognized version naming convention. */
    versionConvention: VersionConvention;

    /** Recognized segment number naming convention. */
    segmentNumConvention: SegmentConvention;
  };
}
