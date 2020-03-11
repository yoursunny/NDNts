import { KeyLocator, Name, SigInfo } from "@ndn/packet";

import { KeyName } from "../name";

export interface PacketWithSignature {
  sigInfo?: SigInfo;
  sigValue?: Uint8Array;
}

export abstract class NamedKey {
  constructor(public readonly name: Name, public readonly sigType: number,
      public readonly keyLocator: KeyLocator|undefined) {
    KeyName.from(name);
  }
}
