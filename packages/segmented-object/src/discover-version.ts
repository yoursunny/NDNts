import { Endpoint } from "@ndn/endpoint";
import { Interest, type Name } from "@ndn/packet";

import { defaultSegmentConvention, defaultVersionConvention, type SegmentConvention, type VersionConvention } from "./convention";
import type { fetch } from "./fetch/mod";

/**
 * Discover version with CanBePrefix.
 * @param name - Name without version component.
 * @returns Promise that resolves to versioned name annotated with identified conventions.
 */
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
  if (!checkSuffixLength(expectedSuffixLen, data.name.length - name.length) ||
      (conventionIndex = conventions.findIndex(([v, s]) => v.match(vComp!) && s.match(sComp!))) < 0) {
    throw new Error(`cannot extract version from ${data.name}`);
  }
  return Object.defineProperties(data.name.getPrefix(-1), {
    versionConvention: { value: conventions[conventionIndex]![0] },
    segmentNumConvention: { value: conventions[conventionIndex]![1] },
  }) as discoverVersion.Result;
}

export namespace discoverVersion {
  export const ANY_SUFFIX_LEN = Symbol("@ndn/segmented-object#discoverVersion.ANY_SUFFIX_LEN");

  export interface Options extends fetch.Options {
    /**
     * Choose a version naming convention.
     * @defaultValue `import("@ndn/naming-convention2").Version`
     */
    versionConvention?: VersionConvention;

    /**
     * List of acceptable version+segment naming convention combinations.
     *
     * @remarks
     * If this is specified and non-empty, it overrides `.versionConvention` and
     * `.segmentNumConvention`.
     */
    conventions?: ReadonlyArray<[VersionConvention, SegmentConvention]>;

    /**
     * Expected number of suffix components, including Version and Segment.
     * @defaultValue 2
     *
     * @remarks
     * Minimum and default are 2, i.e. Version and Segment components.
     * This can be a single number or an array of acceptable numbers.
     * {@link ANY_SUFFIX_LEN} allows any suffix length.
     */
    expectedSuffixLen?: number | readonly number[] | typeof ANY_SUFFIX_LEN;
  }

  export type Result = Name & {
    /** Recognized version naming convention. */
    versionConvention: VersionConvention;

    /** Recognized segment number naming convention. */
    segmentNumConvention: SegmentConvention;
  };
}

function checkSuffixLength(expected: discoverVersion.Options["expectedSuffixLen"], actual: number): boolean {
  switch (true) {
    case expected === discoverVersion.ANY_SUFFIX_LEN: {
      return true;
    }
    case Array.isArray(expected): {
      return expected.includes(actual);
    }
    default: {
      return expected === actual;
    }
  }
}
