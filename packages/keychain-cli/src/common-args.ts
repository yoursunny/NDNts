import { KeyChain } from "@ndn/keychain";

export interface CommonArgs {
  locator: string;
}

export let keyChain: KeyChain;

export async function applyCommonArgs(args: CommonArgs) {
  keyChain = KeyChain.open(args.locator);
}
