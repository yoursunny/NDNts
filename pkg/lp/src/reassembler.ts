import { concatBuffers, evict } from "@ndn/util";

import { LpPacket } from "./packet";

class PartialPacket {
  constructor(public readonly seqNumBase: bigint) {}

  private readonly buffer: Array<LpPacket | undefined> = [];
  private accepted = 0;
  private payloadLength = 0;

  public accept(fragment: LpPacket): false | LpPacket | undefined {
    if (this.accepted === 0) { // first
      this.buffer.length = fragment.fragCount;
      this.acceptOne(fragment);
      return undefined;
    }

    if (fragment.fragCount !== this.buffer.length) { // mismatch
      return false;
    }

    if (this.buffer[fragment.fragIndex]) { // duplicate
      return undefined;
    }

    this.acceptOne(fragment);
    if (this.accepted === this.buffer.length) {
      return this.reassemble();
    }
    return undefined;
  }

  private acceptOne(fragment: LpPacket): void {
    this.buffer[fragment.fragIndex] = fragment;
    ++this.accepted;
    this.payloadLength += fragment.payload?.length ?? 0;
  }

  private reassemble(): LpPacket {
    const full = Object.assign(new LpPacket(), this.buffer[0]!.l3);
    const parts: Uint8Array[] = [];
    for (const fragment of this.buffer) {
      const part = fragment!.payload;
      if (part) {
        parts.push(part);
      }
    }
    full.payload = concatBuffers(parts, this.payloadLength);
    return full;
  }
}

/** NDNLPv2 reassembler. */
export class Reassembler {
  constructor(private readonly capacity: number) {}

  private readonly partials = new Map<bigint, PartialPacket>();

  /**
   * Process a fragment.
   * @returns Fully reassembled packet, or undefined if packet is not yet complete.
   */
  public accept(fragment: LpPacket): LpPacket | undefined {
    if (fragment.fragCount === 1) { // not fragmented
      return fragment;
    }
    if (fragment.fragSeqNum === undefined ||
      fragment.fragIndex >= fragment.fragCount) { // bad fragment
      return undefined;
    }

    const seqNumBase = BigInt.asUintN(64, fragment.fragSeqNum - BigInt(fragment.fragIndex));
    const partial = this.getPartial(seqNumBase);
    const result = partial.accept(fragment);
    if (result) {
      return result;
    }
    if (result !== false) {
      this.putPartial(partial);
    }
    return undefined;
  }

  private getPartial(seqNumBase: bigint): PartialPacket {
    const partial = this.partials.get(seqNumBase);
    if (partial) {
      this.partials.delete(seqNumBase);
      return partial;
    }
    return new PartialPacket(seqNumBase);
  }

  private putPartial(partial: PartialPacket): void {
    this.partials.set(partial.seqNumBase, partial);
    evict(this.capacity, this.partials);
  }
}
