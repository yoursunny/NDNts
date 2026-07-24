import { getSigner, openUplinks } from "@ndn/cli-common";
import type { Signer } from "@ndn/packet";

export type CommonArgs = {};

export let signer: Signer;

export async function applyCommonArgs(_: CommonArgs) {
  await openUplinks();
  signer = await getSigner();
}

export function checkVersionArg(keywords: readonly string[]): (args: { ver: string }) => boolean {
  return ({ ver }) => {
    if (keywords.includes(ver)) {
      return true;
    }
    const n = Number.parseInt(ver, 10);
    if (Number.isSafeInteger(n) && n >= 0) {
      return true;
    }
    throw new Error(`--ver must be '${keywords.join("' or '")}' or a non-negative integer`);
  };
}
