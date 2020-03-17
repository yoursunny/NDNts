import { Segment, Version } from "@ndn/naming-convention2";
import { NamingConvention } from "@ndn/packet";

export type VersionConvention = NamingConvention<unknown, unknown>;
export type VersionConventionFromNumber = NamingConvention<number, unknown>;
export const defaultVersionConvention = Version;

export type SegmentConvention = NamingConvention<number, number>;
export const defaultSegmentConvention = Segment;
