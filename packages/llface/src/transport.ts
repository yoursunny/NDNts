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
  readonly rx: AsyncIterable<Decoder.Tlv>;

  /**
   * TX function for outgoing packets.
   *
   * @returns Promise that resolves when iterable is exhausted, and rejects upon error.
   */
  readonly tx: (iterable: AsyncIterable<Uint8Array>) => Promise<void>;
}
