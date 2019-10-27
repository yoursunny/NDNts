import { KeyLocator, SigInfo } from "@ndn/l3pkt";
import { Name } from "@ndn/name";

import { KeyName } from "../name";
import { PrivateKey } from "./private-key";
import { PublicKey } from "./public-key";

export interface PacketWithSignature {
  sigInfo?: SigInfo;
  sigValue?: Uint8Array;
}

export abstract class NamedKey {
  constructor(public readonly name: Name, public readonly sigType: number,
              public readonly keyLocator: KeyLocator|undefined) {
  }
}

export const KEYGEN = Symbol("KeyChain.KeyGen");

export interface KeyGenResult {
  privateKey: PrivateKey;
  privateKeyExported: object;
  publicKey: PublicKey;
}

export interface KeyGenerator<A extends any[]> {
  /**
   * Generate a key pair.
   * @param name key name.
   * @param needJson true if privateKeyExported must be serializable as JSON,
   *                 false if privateKeyExported only needs to support structured clone algorithm.
   */
  [KEYGEN](name: KeyName, needJson: boolean, ...args: A): Promise<KeyGenResult>;
}
