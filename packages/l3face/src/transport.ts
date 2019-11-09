import { Decoder } from "@ndn/tlv";

/**
 * Low-level transport.
 *
 * The transport understands NDN TLV structures, but does not otherwise concern with packet format.
 */
export interface Transport {
  /**
   * RX iterable for incoming packets.
   */
  readonly rx: Transport.Rx;

  /**
   * TX function for outgoing packets.
   *
   * @returns Promise that resolves when iterable is exhausted, and rejects upon error.
   */
  readonly tx: Transport.Tx;
}

export namespace Transport {
  export type Rx = AsyncIterable<Decoder.Tlv>;

  export type Tx = (iterable: AsyncIterable<Uint8Array>) => Promise<void>;
}
