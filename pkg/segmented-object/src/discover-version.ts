import { consume, type ConsumerOptions, type Endpoint } from "@ndn/endpoint";
import { type Forwarder } from "@ndn/fw";
import { Interest, type Name, type Verifier } from "@ndn/packet";

import { defaultSegmentConvention, defaultVersionConvention, type SegmentConvention, type VersionConvention } from "./convention";

/**
 * Discover version with CanBePrefix.
 * @param name - Name without version component.
 * @returns Promise that resolves to versioned name annotated with identified conventions.
 */
export async function discoverVersion(name: Name, {
  endpoint, // eslint-disable-line etc/no-deprecated
  fw, // eslint-disable-line etc/no-deprecated
  describe, // eslint-disable-line etc/no-deprecated
  modifyInterest, // eslint-disable-line etc/no-deprecated
  signal, // eslint-disable-line etc/no-deprecated
  verifier, // eslint-disable-line etc/no-deprecated
  retxLimit, // eslint-disable-line etc/no-deprecated
  cOpts,
  versionConvention = defaultVersionConvention,
  segmentNumConvention = defaultSegmentConvention,
  conventions: conventionsInput = [],
  expectedSuffixLen = 2,
}: discoverVersion.Options = {}): Promise<discoverVersion.Result> {
  const interest = new Interest(name, Interest.CanBePrefix, Interest.MustBeFresh);
  const data = await consume(interest, {
    fw,
    describe: describe ?? `discoverVersion(${name})`,
    modifyInterest,
    signal,
    verifier,
    retx: retxLimit,
    ...endpoint?.cOpts,
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
     * Endpoint for communication.
     * @deprecated Specify `.cOpts`.
     */
    endpoint?: Endpoint;

    /**
     * Use the specified logical forwarder.
     * @deprecated Specify in `.cOpts.fw`.
     */
    fw?: Forwarder;

    /**
     * FwFace description.
     * @deprecated Specify in `.cOpts.describe`.
     */
    describe?: string;

    /**
     * Interest modification.
     * @deprecated Specify in `.cOpts.modifyInterest`.
     */
    modifyInterest?: Interest.Modify;

    /**
     * AbortSignal that allows canceling the Interest via AbortController.
     * @deprecated Specify in `.cOpts.signal`.
     */
    signal?: AbortSignal;

    /**
     * Data verifier.
     * @deprecated Specify in `.cOpts.verifier`.
     */
    verifier?: Verifier;

    /**
     * Maximum number of retransmissions, excluding initial Interest.
     * @deprecated Specify in `.cOpts.retx`.
     */
    retxLimit?: number;

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
  return (expected === discoverVersion.ANY_SUFFIX_LEN) ||
    (Array.isArray(expected) && expected.includes(actual)) ||
    expected === actual;
}
