import { Encoder } from "@ndn/tlv";

import { LpPacket } from "./packet";

class SeqNumGen {
  constructor() {
    const nibbles = [];
    for (let i = 0; i < 16; ++i) {
      nibbles.push(Math.floor(Math.random() * 0x100)).toString(16);
    }
    this.current = BigInt(`0x${nibbles.join("")}`);
  }

  private current: bigint;

  public next(): bigint {
    ++this.current;
    this.current = BigInt.asUintN(64, this.current);
    return this.current;
  }
}

const OVERHEAD = 0 +
  1 + 3 + // LpPacket TL
  1 + 1 + 8 + // LpSeqNum
  1 + 1 + 2 + // FragIndex
  1 + 1 + 2 + // FragCount
  1 + 3 + // LpPayload TL
  0;

export class Fragmenter {
  constructor(public readonly mtu: number) {
    this.fragmentRoom = mtu - OVERHEAD;
  }

  private seqNumGen = new SeqNumGen();
  private fragmentRoom: number;

  public fragment(full: LpPacket): LpPacket[] {
    const sizeofL3Headers = Encoder.encode(full.encodeL3Headers()).length;
    const sizeofPayload = full.payload?.byteLength ?? 0;
    const sizeofFirstFragment = Math.min(sizeofPayload, this.fragmentRoom - sizeofL3Headers);

    if (sizeofFirstFragment === sizeofPayload) { // no fragmentation necessary
      return [full];
    }
    if (sizeofFirstFragment <= 0) { // MTU is too small for L3 headers, drop the packet
      return [];
    }

    const fragments: LpPacket[] = [];

    const first = new LpPacket();
    first.copyL3HeadersFrom(full);
    first.fragSeqNum = this.seqNumGen.next();
    first.payload = full.payload!.slice(0, sizeofFirstFragment);
    fragments.push(first);

    for (let offset = sizeofFirstFragment; offset < sizeofPayload; offset += this.fragmentRoom) {
      const fragment = new LpPacket();
      fragment.fragSeqNum = this.seqNumGen.next();
      fragment.fragIndex = fragments.length;
      fragment.payload = full.payload!.slice(offset, offset + this.fragmentRoom);
      fragments.push(fragment);
    }

    for (const fragment of fragments) {
      fragment.fragCount = fragments.length;
    }
    return fragments;
  }
}
