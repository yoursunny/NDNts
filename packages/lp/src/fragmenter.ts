import { Encoder } from "@ndn/tlv";

import { LpPacket } from "./packet";

class SeqNumGen {
  private current = (BigInt(Math.trunc(Math.random() * 0x100000000)) << 32n) |
                    BigInt(Math.trunc(Math.random() * 0x100000000));

  public next(): bigint {
    this.current = BigInt.asUintN(64, this.current + 1n);
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

/** NDNLPv2 fragmenter. */
export class Fragmenter {
  constructor(public readonly mtu: number) {
    this.fragmentRoom = mtu - OVERHEAD;
  }

  private readonly seqNumGen = new SeqNumGen();
  private readonly fragmentRoom: number;

  /**
   * Fragment a packet.
   * @returns a sequence of fragment, or empty array if fragmentation fails.
   */
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
    first.payload = full.payload!.subarray(0, sizeofFirstFragment);
    fragments.push(first);

    for (let offset = sizeofFirstFragment; offset < sizeofPayload; offset += this.fragmentRoom) {
      const fragment = new LpPacket();
      fragment.fragSeqNum = this.seqNumGen.next();
      fragment.fragIndex = fragments.length;
      fragment.payload = full.payload!.subarray(offset, offset + this.fragmentRoom);
      fragments.push(fragment);
    }

    for (const fragment of fragments) {
      fragment.fragCount = fragments.length;
    }
    return fragments;
  }
}
