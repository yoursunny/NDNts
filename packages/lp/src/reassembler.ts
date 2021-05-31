import { LpPacket } from "./packet";

class PartialPacket {
  constructor(public readonly seqNumBase: bigint) {}

  private buffer: Array<LpPacket | undefined> = [];
  private accepted = 0;
  private payloadLength = 0;

  public accept(fragment: LpPacket): false | LpPacket | undefined {
    if (this.accepted === 0) { // first
      this.buffer = Array.from({ length: fragment.fragCount });
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
    const full = new LpPacket();
    full.copyL3HeadersFrom(this.buffer[0]!);
    full.payload = new Uint8Array(this.payloadLength);
    let offset = 0;
    for (const fragment of this.buffer) {
      if (!fragment!.payload) {
        continue;
      }
      full.payload.set(fragment!.payload, offset);
      offset += fragment!.payload.length;
    }
    return full;
  }
}

export class Reassembler {
  constructor(private readonly capacity: number) {}

  private readonly partials = new Map<bigint, PartialPacket>();

  public accept(fragment: LpPacket): LpPacket | undefined {
    if (fragment.fragCount === 1) { // not fragmented
      return fragment;
    }
    if (typeof fragment.fragSeqNum === "undefined" ||
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

    if (this.partials.size >= this.capacity) { // exceed capacity, delete oldest
      // eslint-disable-next-line no-unreachable-loop
      for (const key of this.partials.keys()) {
        this.partials.delete(key);
        break;
      }
    }
  }
}
