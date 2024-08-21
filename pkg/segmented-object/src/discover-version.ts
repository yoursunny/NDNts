import { consume, type ConsumerOptions } from "@ndn/endpoint";
import { Interest, type Name } from "@ndn/packet";
import type { Arrayable } from "type-fest";

import { defaultSegmentConvention, defaultVersionConvention, type SegmentConvention, type VersionConvention } from "./convention";

/**
 * Discover version with CanBePrefix.
 * @param name - Name without version component.
 * @returns Promise that resolves to versioned name annotated with identified conventions.
 */
export async function discoverVersion(name: Name, {
  cOpts,
  versionConvention = defaultVersionConvention,
  segmentNumConvention = defaultSegmentConvention,
  conventions: conventionsInput = [],
  expectedSuffixLen = 2,
}: discoverVersion.Options = {}): Promise<discoverVersion.Result> {
  const interest = new Interest(name, Interest.CanBePrefix, Interest.MustBeFresh);
  const data = await consume(interest, {
    describe: `discoverVersion(${name})`,
    ...cOpts,
  });

  const conventions: ReadonlyArray<[VersionConvention, SegmentConvention]> =
    conventionsInput.length > 0 ? conventionsInput : [[versionConvention, segmentNumConvention]];
  const vComp = data.name.get(-2);
  const sComp = data.name.get(-1);
  let index: number;
  if (!checkSuffixLength(expectedSuffixLen, data.name.length - name.length) ||
      (index = conventions.findIndex(([v, s]) => v.match(vComp!) && s.match(sComp!))) < 0) {
    throw new Error(`cannot extract version from ${data.name}`);
  }
  return Object.defineProperties(data.name.getPrefix(-1), {
    versionConvention: { value: conventions[index]![0] },
    segmentNumConvention: { value: conventions[index]![1] },
  }) as discoverVersion.Result;
}

export namespace discoverVersion {
  export const ANY_SUFFIX_LEN = Symbol("@ndn/segmented-object#discoverVersion.ANY_SUFFIX_LEN");

  export interface Options {
    /**
     * Consumer options.
     *
     * @remarks
     * - `.describe` defaults to "discoverVersion" + name.
     * - `.retx` defaults to 2.
     * - `.verifier` is recommended.
     */
    cOpts?: ConsumerOptions;

    /**
     * Choose a version naming convention.
     * @defaultValue `Version3`
     */
    versionConvention?: VersionConvention;

    /**
     * Choose a segment number naming convention.
     * @defaultValue `Segment3`
     */
    segmentNumConvention?: SegmentConvention;

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
    expectedSuffixLen?: Arrayable<number> | typeof ANY_SUFFIX_LEN;
  }

  export type Result = Name & {
    /** Recognized version naming convention. */
    versionConvention: VersionConvention;

    /** Recognized segment number naming convention. */
    segmentNumConvention: SegmentConvention;
  };
}

function checkSuffixLength(expected: discoverVersion.Options["expectedSuffixLen"], actual: number): boolean {
  return (expected === discoverVersion.ANY_SUFFIX_LEN) ||
    (Array.isArray(expected) && expected.includes(actual)) ||
    expected === actual;
}
