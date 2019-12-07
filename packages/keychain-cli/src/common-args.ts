import { openKeyChain } from "@ndn/cli-common";
import { KeyChain } from "@ndn/keychain";

export type CommonArgs = {};

export let keyChain: KeyChain;

export async function applyCommonArgs(args: CommonArgs) {
  keyChain = openKeyChain();
}
