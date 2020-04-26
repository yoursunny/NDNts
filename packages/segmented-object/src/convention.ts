import { Segment, Version } from "@ndn/naming-convention2";
import { NamingConvention } from "@ndn/packet";

export type VersionConvention = NamingConvention<any>;
export type VersionConventionFromNumber = NamingConvention<number, unknown>;
export const defaultVersionConvention: VersionConventionFromNumber = Version;

export type SegmentConvention = NamingConvention<number>;
export const defaultSegmentConvention: SegmentConvention = Segment;
