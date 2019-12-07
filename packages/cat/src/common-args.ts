import { getSigner, openUplinks } from "@ndn/cli-common";
import { PrivateKey } from "@ndn/keychain";
import { Segment as Segment1, Version as Version1 } from "@ndn/naming-convention1";
import { Segment as Segment2, Version as Version2 } from "@ndn/naming-convention2";

export interface CommonArgs {
  convention1: boolean;
}

export let versionConvention = Version2;
export let segmentNumConvention = Segment2;
export let signer: PrivateKey;

export async function applyCommonArgs(args: CommonArgs) {
  await openUplinks();
  signer = await getSigner();

  if (args.convention1) {
    versionConvention = Version1;
    segmentNumConvention = Segment1;
  }
}
