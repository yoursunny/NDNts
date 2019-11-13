import { Decoder } from "@ndn/tlv";

/**
 * Low-level transport.
 *
 * The transport understands NDN TLV structures, but does not otherwise concern with packet format.
 */
export abstract class Transport {
  public abstract readonly rx: Transport.Rx;
  public abstract readonly tx: Transport.Tx;

  public readonly isLocal: boolean;
  private describe: string;

  protected constructor({
    isLocal: isLocal = false,
    describe,
  }: Transport.Attributes = {}) {
    this.isLocal = isLocal;
    this.describe = describe || this.constructor.name;
  }

  public toString() { return this.describe; }
}

export namespace Transport {
  export interface Attributes {
    isLocal?: boolean;
    describe?: string;
  }

  /** RX iterable for incoming packets. */
  export type Rx = AsyncIterable<Decoder.Tlv>;

  /**
   * TX function for outgoing packets.
   * @returns Promise that resolves when iterable is exhausted, and rejects upon error.
   */
  export type Tx = (iterable: AsyncIterable<Uint8Array>) => Promise<void>;
}
